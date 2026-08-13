const mongoose = require('mongoose');

const smsBatchSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['individual', 'bulk', 'classwise'], required: true },
    message: { type: String, required: true },
    provider: { type: String, required: true },
    filters: { type: mongoose.Schema.Types.Mixed },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['processing', 'completed', 'completed_with_errors', 'failed'],
      default: 'processing',
    },
    location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentLocation' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

smsBatchSchema.index({ location_id: 1, createdAt: -1 });

module.exports = mongoose.model('SmsBatch', smsBatchSchema);
