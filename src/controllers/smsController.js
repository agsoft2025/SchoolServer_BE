const mongoose = require('mongoose');
const studentModel = require('../model/studentModel');
const SmsBatch = require('../model/smsBatchModel');
const SmsLog = require('../model/smsLogModel');
const { resolveRecipients } = require('../service/sms/recipientResolver');
const { processBatch } = require('../service/sms/batchProcessor');
const { getActiveProvider } = require('../service/sms/providers');
const { findUnknownPlaceholders } = require('../service/sms/templateEngine');

const MODES = ['individual', 'bulk', 'classwise'];

const canAccessLocation = (user, locationId) => user.role === 'SUPER ADMIN' || String(locationId) === String(user.location_id);

const validateSendPayload = ({ mode, message, studentId, classIds }) => {
  if (!MODES.includes(mode)) return 'Invalid mode. Must be individual, bulk or classwise';
  if (!message || !message.trim()) return 'Message is required';
  if (mode === 'individual' && !studentId) return 'studentId is required for individual mode';
  if (mode === 'classwise' && (!Array.isArray(classIds) || !classIds.length)) return 'classIds is required for classwise mode';

  const unknown = findUnknownPlaceholders(message);
  if (unknown.length) return `Unknown placeholder(s): ${unknown.map((key) => `{{${key}}}`).join(', ')}`;

  return null;
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

exports.previewRecipients = async (req, res) => {
  try {
    const { mode, studentId, classIds, search, locationId } = req.body;
    if (!MODES.includes(mode)) return res.status(400).json({ success: false, message: 'Invalid mode' });

    const recipients = await resolveRecipients({ mode, user: req.user, studentId, classIds, search, locationId });

    res.json({
      success: true,
      count: recipients.length,
      sample: recipients.slice(0, 8).map((r) => ({ name: r.variables.student_name, phone: r.phone })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to preview recipients', error: error.message });
  }
};

exports.sendSms = async (req, res) => {
  try {
    const { mode, message, studentId, classIds, search, locationId } = req.body;

    const validationError = validateSendPayload({ mode, message, studentId, classIds });
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const recipients = await resolveRecipients({ mode, user: req.user, studentId, classIds, search, locationId });
    if (!recipients.length) {
      return res.status(404).json({ success: false, message: 'No recipients matched your selection' });
    }

    const provider = getActiveProvider();
    const batchLocationId = req.user.role === 'SUPER ADMIN' ? locationId || recipients[0]?.locationId : req.user.location_id;

    const batch = await SmsBatch.create({
      mode,
      message,
      provider: provider.name,
      filters: { studentId, classIds, search, locationId },
      totalRecipients: recipients.length,
      status: 'processing',
      location_id: batchLocationId,
      created_by: req.user.id,
    });

    // Fire-and-forget: response returns immediately with the batch id, FE polls for progress.
    processBatch(batch._id, recipients, message).catch((error) => {
      console.error('SMS batch processing failed:', batch._id, error);
      SmsBatch.updateOne({ _id: batch._id }, { $set: { status: 'failed' } }).catch(() => {});
    });

    res.status(202).json({
      success: true,
      message: 'SMS batch queued for sending',
      batchId: batch._id,
      totalRecipients: recipients.length,
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
