// OFFLINE FALLBACK ONLY.
//
// The authoritative SMS Template Master lives in SchoolGlobalServer_BE
// (GET /api/sms-templates/internal/active). templateRegistry.js pulls from there
// and caches. This file is used only when the Global server has never been
// reachable since boot, so the SMS Center degrades instead of hard-failing.
//
// Shape matches the normalized registry shape:
//   key            - stable local identifier
//   name           - shown in the picker
//   domain         - always SCHOOL here
//   dltTemplateId  - the operator/DLT numeric template id sent to Fast2SMS
//   approvedText   - exact approved text; one {#var#} per ordered slot
//   fields[]       - one per slot, IN ORDER
//       source: 'input'  => School Admin types it in the SMS Center
//               'record' => value comes from the student record (read-only)
//   status/version - kept for parity with the master
module.exports = [
  {
    key: 'student-notification',
    name: 'Student Notification',
    domain: 'SCHOOL',
    dltTemplateId:
      process.env.FAST2SMS_TEMPLATE_ID && process.env.FAST2SMS_TEMPLATE_ID !== 'your_template_id'
        ? process.env.FAST2SMS_TEMPLATE_ID
        : '224809',
    approvedText: 'Dear {#var#}, {#var#} - SID GROUPS',
    fields: [
      { key: 'student_name', label: 'Student name', type: 'text', maxLength: 30, required: true, source: 'record' },
      { key: 'message', label: 'Message text', type: 'alphanumeric', maxLength: 160, required: true, source: 'input' },
    ],
    status: 'ACTIVE',
    version: 1,
  },
];
