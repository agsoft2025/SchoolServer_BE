const mongoose = require('mongoose');
const studentModel = require('../model/studentModel');
const SmsBatch = require('../model/smsBatchModel');
const SmsLog = require('../model/smsLogModel');
const { resolveRecipients } = require('../service/sms/recipientResolver');
const { processBatch } = require('../service/sms/batchProcessor');
const { getActiveProvider } = require('../service/sms/providers');
const { renderTemplate, findUnknownPlaceholders } = require('../service/sms/templateEngine');
const smsTemplates = require('../config/smsTemplates');

const MODES = ['individual', 'bulk', 'classwise', 'hostelwise'];

const canAccessLocation = (user, locationId) => user.role === 'SUPER ADMIN' || String(locationId) === String(user.location_id);

const findTemplate = (id) => smsTemplates.find((t) => String(t.id) === String(id));

// Name of the first 'input' variable the caller has not filled, or null.
const missingInputVar = (template, inputVars) => {
  const missing = (template.variables || []).find(
    (v) => v.source === 'input' && !String(inputVars?.[v.key] ?? '').trim()
  );
  return missing ? missing.label || missing.key : null;
};

// Build the ordered Fast2SMS variable list for one recipient + a readable
// preview of the fully-rendered message (stored on the batch/log for history).
const buildTemplateMessage = (template, studentVars, inputVars) => {
  const values = (template.variables || []).map((v) =>
    v.source === 'input'
      ? String(inputVars?.[v.key] ?? '').trim()
      : String(studentVars?.[v.source] ?? '').trim()
  );

  let preview = template.body;
  (template.variables || []).forEach((v, i) => {
    preview = preview.split(`{{${v.key}}}`).join(values[i] || '');
  });

  return { values, preview };
};

exports.getClassGroups = async (req, res) => {
  try {
    const locationFilter =
      req.user.role === 'SUPER ADMIN'
        ? req.query.location_id
          ? { location_id: new mongoose.Types.ObjectId(req.query.location_id) }
          : {}
        : { location_id: new mongoose.Types.ObjectId(req.user.location_id) };

    const groups = await studentModel.aggregate([
      { $match: { isDeleted: { $ne: true }, class_info: { $ne: null }, ...locationFilter } },
      { $group: { _id: '$class_info', count: { $sum: 1 } } },
      { $lookup: { from: 'classinfos', localField: '_id', foreignField: '_id', as: 'class' } },
      { $unwind: '$class' },
      {
        $project: {
          _id: 1,
          count: 1,
          class_name: '$class.class_name',
          section: '$class.section',
          academic_year: '$class.academic_year',
        },
      },
      { $sort: { class_name: 1, section: 1 } },
    ]);

    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load class groups', error: error.message });
  }
};

exports.getHostelGroups = async (req, res) => {
  try {
    const locationFilter =
      req.user.role === 'SUPER ADMIN'
        ? req.query.location_id
          ? { location_id: new mongoose.Types.ObjectId(req.query.location_id) }
          : {}
        : { location_id: new mongoose.Types.ObjectId(req.user.location_id) };

    const groups = await studentModel.aggregate([
      { $match: { isDeleted: { $ne: true }, hostel_name: { $nin: [null, ''] }, ...locationFilter } },
      { $group: { _id: '$hostel_name', count: { $sum: 1 } } },
      { $project: { _id: 0, hostel_name: '$_id', count: 1 } },
      { $sort: { hostel_name: 1 } },
    ]);

    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load hostel groups', error: error.message });
  }
};

exports.previewRecipients = async (req, res) => {
  try {
    const { mode, studentId, classIds, hostelNames, search, locationId } = req.body;
    if (!MODES.includes(mode)) return res.status(400).json({ success: false, message: 'Invalid mode' });

    const recipients = await resolveRecipients({ mode, user: req.user, studentId, classIds, hostelNames, search, locationId });

    res.json({
      success: true,
      count: recipients.length,
      sample: recipients.slice(0, 8).map((r) => ({ name: r.variables.student_name, phone: r.phone })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to preview recipients', error: error.message });
  }
};

exports.getTemplates = (req, res) => {
  res.json({ success: true, data: smsTemplates });
};

exports.sendSms = async (req, res) => {
  try {
    const { mode, message, templateId, variables: inputVars, studentId, classIds, hostelNames, search, locationId } = req.body;

    if (!MODES.includes(mode)) {
      return res.status(400).json({ success: false, message: 'Invalid mode. Must be individual, bulk, classwise or hostelwise' });
    }
    if (mode === 'individual' && !studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required for individual mode' });
    }
    if (mode === 'classwise' && (!Array.isArray(classIds) || !classIds.length)) {
      return res.status(400).json({ success: false, message: 'classIds is required for classwise mode' });
    }
    if (mode === 'hostelwise' && (!Array.isArray(hostelNames) || !hostelNames.length)) {
      return res.status(400).json({ success: false, message: 'hostelNames is required for hostelwise mode' });
    }

    const provider = getActiveProvider();
    const template = templateId ? findTemplate(templateId) : null;

    if (templateId && !template) {
      return res.status(400).json({ success: false, message: 'Unknown SMS template' });
    }
    // The live provider can only send content that matches an approved DLT
    // template; a raw free-text message is allowed only on the console (mock)
    // provider used for local testing.
    if (provider.name !== 'console' && !template) {
      return res.status(400).json({ success: false, message: 'Select an approved SMS template before sending' });
    }

    if (template) {
      const missing = missingInputVar(template, inputVars);
      if (missing) return res.status(400).json({ success: false, message: `Please fill "${missing}"` });
    } else {
      if (!message || !message.trim()) return res.status(400).json({ success: false, message: 'Message is required' });
      const unknown = findUnknownPlaceholders(message);
      if (unknown.length) {
        return res
          .status(400)
          .json({ success: false, message: `Unknown placeholder(s): ${unknown.map((k) => `{{${k}}}`).join(', ')}` });
      }
    }

    const recipients = await resolveRecipients({ mode, user: req.user, studentId, classIds, hostelNames, search, locationId });
    if (!recipients.length) {
      return res.status(404).json({ success: false, message: 'No recipients matched your selection' });
    }

    // Resolve each recipient's final text + ordered DLT variables up front, then
    // hand pre-rendered recipients to processBatch (template arg stays null, the
    // same shape the retry path already uses).
    const prepared = recipients.map((r) => {
      if (!template) return { ...r, message: renderTemplate(message, r.variables || {}) };
      const { values, preview } = buildTemplateMessage(template, r.variables, inputVars);
      return { ...r, templateId: String(template.id), dltVariables: values, message: preview };
    });

    const batchLocationId = req.user.role === 'SUPER ADMIN' ? locationId || recipients[0]?.locationId : req.user.location_id;

    const batch = await SmsBatch.create({
      mode,
      message: prepared[0].message,
      provider: provider.name,
      dlt_template_id: template ? String(template.id) : undefined,
      filters: { studentId, classIds, hostelNames, search, locationId, templateId, variables: inputVars },
      totalRecipients: prepared.length,
      status: 'processing',
      location_id: batchLocationId,
      created_by: req.user.id,
    });

    // Fire-and-forget: response returns immediately with the batch id, FE polls for progress.
    processBatch(batch._id, prepared, null).catch((error) => {
      console.error('SMS batch processing failed:', batch._id, error);
      SmsBatch.updateOne({ _id: batch._id }, { $set: { status: 'failed' } }).catch(() => {});
    });

    res.status(202).json({
      success: true,
      message: 'SMS batch queued for sending',
      batchId: batch._id,
      totalRecipients: prepared.length,
      provider: provider.name,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send SMS', error: error.message });
  }
};

exports.getBatches = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const locationFilter = req.user.role === 'SUPER ADMIN' ? {} : { location_id: req.user.location_id };

    const currentPage = Number(page);
    const perPage = Number(limit);

    const [batches, totalItems] = await Promise.all([
      SmsBatch.find(locationFilter)
        .populate('created_by', 'username fullname')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * perPage)
        .limit(perPage)
        .lean(),
      SmsBatch.countDocuments(locationFilter),
    ]);

    res.json({ success: true, data: batches, currentPage, totalPages: Math.ceil(totalItems / perPage), totalItems });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch SMS history', error: error.message });
  }
};

exports.getBatchById = async (req, res) => {
  try {
    const batch = await SmsBatch.findById(req.params.id).populate('created_by', 'username fullname').lean();
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    if (!canAccessLocation(req.user, batch.location_id)) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this batch' });
    }

    res.json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch batch', error: error.message });
  }
};

exports.getBatchLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const batch = await SmsBatch.findById(req.params.id).lean();
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    if (!canAccessLocation(req.user, batch.location_id)) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this batch' });
    }

    const filter = { batch_id: batch._id };
    if (status) filter.status = status;

    const currentPage = Number(page);
    const perPage = Number(limit);

    const [logs, totalItems] = await Promise.all([
      SmsLog.find(filter)
        .sort({ createdAt: 1 })
        .skip((currentPage - 1) * perPage)
        .limit(perPage)
        .lean(),
      SmsLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: logs, currentPage, totalPages: Math.ceil(totalItems / perPage), totalItems });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch batch logs', error: error.message });
  }
};

exports.retryFailed = async (req, res) => {
  try {
    const batch = await SmsBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    if (!canAccessLocation(req.user, batch.location_id)) {
      return res.status(403).json({ success: false, message: 'Not allowed to modify this batch' });
    }
    if (batch.status === 'processing') {
      return res.status(409).json({ success: false, message: 'Batch is still processing' });
    }

    const failedLogs = await SmsLog.find({ batch_id: batch._id, status: 'failed' }).lean();
    if (!failedLogs.length) {
      return res.status(400).json({ success: false, message: 'No failed messages to retry' });
    }

    const recipients = failedLogs.map((log) => ({
      studentId: log.student_id,
      phone: log.phone,
      locationId: log.location_id,
      message: log.message,
      templateId: log.dlt_template_id,
      dltVariables: log.dlt_variables,
      variables: { student_name: log.recipient_name },
    }));

    await SmsLog.deleteMany({ batch_id: batch._id, status: 'failed' });

    batch.status = 'processing';
    batch.failedCount = 0;
    await batch.save();

    processBatch(batch._id, recipients, null).catch((error) => {
      console.error('SMS retry processing failed:', batch._id, error);
      SmsBatch.updateOne({ _id: batch._id }, { $set: { status: 'failed' } }).catch(() => {});
    });

    res.status(202).json({ success: true, message: 'Retrying failed messages', retryCount: recipients.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retry batch', error: error.message });
  }
};
