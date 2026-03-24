const mongoose = require('mongoose');

const financialSchema = new mongoose.Schema({
    student_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Student" },
    custodyType: { type: String}, 
    transaction: { type: String },  // "CREDIT", "DEBIT", "TRANSFER", "REFUND"
    hoursWorked: { type: Number, default: 0 },
    wageAmount: { type: Number, default: 0 },

    // 💰 Deposit related
    depositName: { type: String },
    relationShipId: { type: String },
    depositAmount: { type: Number, default: 0 },
    depositType: { type: String }, // "CASH", "BANK", "ONLINE", "CHEQUE", "UPI", "OTHER"
    type: { type: String}, // "DEPOSIT", "WITHDRAWAL", "WAGES".
    status: { type: String, required: true }, // "SUCCESS", "FAILED", "PENDING"

    // 🆕 Additional fields
    depositedByType: { 
        type: String, 
        enum: ['USER', 'OUTSIDER'], 
        default: 'OUTSIDER' },
    depositedBy: { type: String },
    depositedById: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        default: null 
    },
    contactNumber: { type: String }, // optional: if outsider provides phone number
    remarks: { type: String }, // additional notes

}, { timestamps: true });

module.exports = mongoose.model('Financial', financialSchema);
