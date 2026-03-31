// models/ClassInfo.js
const mongoose = require('mongoose');

const classInfoSchema = new mongoose.Schema({
  class_name: { type: String },
  section: { type: String },
  academic_year: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('ClassInfo', classInfoSchema);
