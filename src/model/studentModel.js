const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  registration_number: { type: String, required: true, unique: true },
  descriptor: { type: [Number], default: [] },
  student_name: { type: String, required: true },
  mother_name: { type: String, required: true },
  father_name: { type: String, required: true },
  contact_number: { type: String, required: true },
  date_of_birth: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  birth_place: { type: String },
  nationality: { type: String },
  mother_tongue: { type: String },
  blood_group: { type: String },
  religion: { type: String },
  hostel_name: { type: String, required: true },
  board_name: { type: String, required: true },
  deposite_amount: { type: Number },
  class_info: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassInfo' },
  pro_pic: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentFile' },
  location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentLocation', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);


//   registration_number: { type: String, required: true, unique: true },
//   father_name: { type: String, required: true },
//   student_name:{ type: String, required: true },
//   mother_name: { type: String, required: true },
//   date_of_birth: { type: Date, required: true },
//   gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
//   birth_place: { type: String },
//   nationality: { type: String },
//   mother_toungue: { type: String },
//   blood_group: { type: String },
//   religion: { type: String },
//   deposite_amount:{type:Number,required:true},
//   class_info: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassInfo' } // Reference to ClassInfo
// }, { timestamps: true });