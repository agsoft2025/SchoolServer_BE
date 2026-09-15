const mongoose = require('mongoose');
const studentModel = require('../model/studentModel');
const SmsBatch = require('../model/smsBatchModel');
const SmsLog = require('../model/smsLogModel');
const { resolveRecipients } = require('../service/sms/recipientResolver');
const { processBatch } = require('../service/sms/batchProcessor');
const { getActiveProvider } = require('../service/sms/providers');
const {
  getActiveTemplates,
  getSchoolSmsMeta,
  findActiveTemplate,
  DEFAULT_SENDER_HEADER,
} = require('../service/sms/templateRegistry');
const { validateValues, assembleMessage } = require('../service/sms/dltAssembler');

const MODES = ['individual', 'bulk', 'classwise', 'hostelwise'];

const canAccessLocation = (user, locationId) => user.role === 'SUPER ADMIN' || String(locationId) === String(user.location_id);

// The cross-service tenant key used to scope templates to a school. For a
// School Admin it is always their own location; a SUPER ADMIN must name the
// target school explicitly (query/body `location_id`). Equals this server's
// StudentLocation._id == the Global Location.externalId.
const resolveSchoolKey = (user, explicitLocationId) =>
  String((user.role === 'SUPER ADMIN' ? explicitLocationId : user.location_id) || '');

// Ordered value list for a template's {#...#} slots.
//   'input'  fields come from the sender's form (identical for every recipient)
//   'record' fields come from the resolved student record and are NOT settable
//            by the sender (name, class, etc.)
const buildValues = (template, recordVars, inputVars) =>
  (template.fields || []).map((f) =>
    f.source === 'record'
      ? String(recordVars?.[f.key] ?? '').trim()
      : String(inputVars?.[f.key] ?? '').trim()
  );

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

// School Admin: read-only list of approved, ACTIVE SCHOOL templates. The DLT
// template id is deliberately NOT exposed — the sender must not see or change it.
exports.getTemplates = async (req, res) => {
  try {
    // A School Admin is always scoped to their own school. A SUPER ADMIN may
    // scope to a named school (?location_id=) or, with none, see the full active
    // catalogue (trusted, legacy behaviour).
    const schoolKey = resolveSchoolKey(req.user, req.query.location_id);
    const [templates, meta] = await Promise.all([
      getActiveTemplates(schoolKey ? { externalId: schoolKey } : {}),
      schoolKey ? getSchoolSmsMeta(schoolKey) : Promise.resolve({ assignedSenderIds: [], source: 'fallback' }),
    ]);

    // Only senders that actually have at least one usable template are worth
    // offering in the SMS Center picker.
    const senderIds = [...new Set(templates.map((t) => t.senderId).filter(Boolean))].sort();

    res.json({
      success: true,
      // The Sender ID(s) this school may send under, and whether that came from
      // an explicit Super Admin assignment ('config') or the historical default
      // ('fallback'). An empty list with source 'config' == SMS disabled.
      assignedSenderIds: meta.assignedSenderIds || [],
      senderSource: meta.source || 'fallback',
      senderIds,
      data: templates.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        domain: t.domain,
        senderId: t.senderId, // visible sender header only — the DLT numeric id stays hidden
        approvedText: t.approvedText,
        placeholderCount: t.placeholderCount,
        version: t.version,
        fields: (t.fields || []).map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          maxLength: f.maxLength,
          required: f.required,
          source: f.source,
        })),
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load SMS templates', error: error.message });
  }
};

exports.sendSms = async (req, res) => {
  try {
    console.log("<><>working",req.body);
    const {
      mode,
      templateId,
      senderId: bodySenderId,
      variables: inputVars,
      studentId,
      classIds,
      hostelNames,
      search,
      locationId,
    } = req.body;

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

    // A DLT-approved template is mandatory — there is no free-text send path.
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'An SMS template must be selected' });
    }

    // ------------------------------------------------------------------
    // Tenant + Sender ID + Template authorization (all server-side).
    //   authenticated user -> role -> school/location -> assigned Sender ID
    //   -> selected template -> Sender ID ↔ Template relationship -> send
    // Nothing here trusts a client-supplied schoolId/locationId: for a School
    // Admin the tenant key comes only from req.user.location_id.
    // ------------------------------------------------------------------
    const schoolKey = resolveSchoolKey(req.user, locationId);

    // The Sender ID(s) this school may send under.
    const { assignedSenderIds = [], source: senderSource = 'fallback' } = schoolKey
      ? await getSchoolSmsMeta(schoolKey)
      : { assignedSenderIds: [], source: 'fallback' };
    const allowedSenders = senderSource === 'fallback' && schoolKey
      ? [DEFAULT_SENDER_HEADER]
      : assignedSenderIds.map((h) => String(h).toUpperCase());

    if (schoolKey && senderSource === 'config' && allowedSenders.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No SMS Sender ID is configured for your school. Ask your administrator to assign one.',
      });
    }

    // Resolve the effective Sender ID: honour the one the sender picked; if none
    // given and the school has exactly one, use it; otherwise require a choice.
    let senderId = String(bodySenderId || '').trim().toUpperCase();
    if (!senderId) {
      if (allowedSenders.length === 1) senderId = allowedSenders[0];
      else if (schoolKey)
        return res.status(400).json({ success: false, message: 'A Sender ID must be selected' });
    }
    // The chosen Sender ID must be one this school may use (never silently fall back).
    if (schoolKey && senderId && !allowedSenders.includes(senderId)) {
      return res.status(403).json({ success: false, message: 'That Sender ID is not assigned to your school' });
    }

    const template = await findActiveTemplate(templateId, schoolKey || undefined);
    if (!template) {
      return res.status(403).json({
        success: false,
        message: schoolKey
          ? 'This SMS template is not available for your school'
          : 'Selected template is not available (inactive, deleted, or not a SCHOOL template)',
      });
    }
    if (!template.dltTemplateId) {
      return res.status(400).json({ success: false, message: 'Template has no DLT Template ID configured; cannot send' });
    }

    const templateSender = String(template.senderId || '').trim().toUpperCase();
    if (!templateSender) {
      return res.status(400).json({ success: false, message: 'Template has no Sender ID configured; cannot send' });
    }
    // The template must belong to the selected Sender ID (blocks a templateId
    // from another sender being paired with an allowed sender).
    if (senderId && templateSender !== senderId) {
      return res
        .status(403)
        .json({ success: false, message: 'The selected template does not belong to the selected Sender ID' });
    }
    // For the trusted no-school (SUPER ADMIN) path, take the template's sender.
    if (!senderId) senderId = templateSender;

    const inputFieldSpecs = (template.fields || []).filter((f) => f.source === 'input');
    const inputKeys = new Set(inputFieldSpecs.map((f) => f.key));

    // Reject unexpected fields — anything submitted that the template doesn't declare.
    const extra = Object.keys(inputVars || {}).filter((k) => !inputKeys.has(k));
    if (extra.length) {
      return res.status(400).json({ success: false, message: `Unexpected field(s): ${extra.join(', ')}` });
    }

    // Validate sender-provided values once (fail fast, before any recipient work).
    for (const f of inputFieldSpecs) {
      const v = String(inputVars?.[f.key] ?? '').trim();
      if (f.required && !v) return res.status(400).json({ success: false, message: `Please fill "${f.label}"` });
      if (v && v.length > (f.maxLength || 30)) {
        return res.status(400).json({ success: false, message: `"${f.label}" exceeds ${f.maxLength || 30} characters` });
      }
    }

    const provider = getActiveProvider();

    const recipients = await resolveRecipients({ mode, user: req.user, studentId, classIds, hostelNames, search, locationId });
    if (!recipients.length) {
      return res.status(404).json({ success: false, message: 'No recipients matched your selection' });
    }

    // Assemble every recipient's final message on the backend from the approved
    // text + validated ordered values. The client never builds the final SMS.
    const prepared = [];
    for (const r of recipients) {
      const values = buildValues(template, r.variables, inputVars);
      const check = validateValues(template.approvedText, values, template.fields);
      if (!check.ok) {
        return res
          .status(400)
          .json({ success: false, message: `${r.variables?.student_name || r.phone}: ${check.error}` });
      }
      prepared.push({
        ...r,
        templateId: template.dltTemplateId, // real DLT numeric id passed to Fast2SMS
        dltVariables: values,
        senderId, // derived from the template — never taken from the client
        message: assembleMessage(template.approvedText, values),
        templateKey: template.key,
        templateVersion: template.version,
      });
    }

    const batchLocationId = req.user.role === 'SUPER ADMIN' ? locationId || recipients[0]?.locationId : req.user.location_id;

    const batch = await SmsBatch.create({
      mode,
      message: prepared[0].message,
      provider: provider.name,
      dlt_template_id: template.dltTemplateId,
      sender_id: senderId,
      template_key: template.key,
      template_version: template.version,
      template_name: template.name,
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
    console.log("error",error)
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
      senderId: log.sender_id,
      templateKey: log.template_key,
      templateVersion: log.template_version,
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
