const mongoose = require('mongoose');

const studentFileSchema = new mongoose.Schema(
  {
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    original_name: { 
      type: String, 
      required: true 
    },
    file_name: { 
      type: String, 
      required: true 
    },
    file_url: { 
      type: String, 
      required: true 
    },
    file_type: { 
      type: String, 
      required: true 
    },
    remarks: { 
      type: String, 
      default: null 
    },
    file_category: {
      type: String,
      enum: ['document', 'pro_pic'],
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudentFile', studentFileSchema);
