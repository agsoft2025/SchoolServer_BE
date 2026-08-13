const mongoose = require('mongoose');

const smsLogSchema = new mongoose.Schema(
  {
    batch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsBatch', required: true, index: true },
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    recipient_name: { type: String },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    provider: { type: String },
    provider_response: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentLocation' },
  },
  { timestamps: true }
);

smsLogSchema.index({ batch_id: 1, status: 1 });

module.exports = mongoose.model('SmsLog', smsLogSchema);
