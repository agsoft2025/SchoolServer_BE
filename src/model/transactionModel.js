const { default: mongoose } = require("mongoose");

const transactionSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  user_id:{ type:mongoose.Schema.Types.ObjectId, ref:'User',required:true},
  order_id: { type: String, required: true },
  payment_id: { type: String },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  payment_mode: { type: String, default: 'razorpay' },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
