const mongoose = require('mongoose');

// const custodyLimitSchema = new mongoose.Schema({
//     custodyType: {
//         type: String,
//         required: true,
//         enum: ['remand_prison', 'under_trail', 'contempt_of_court']
//     },
//     spendLimit: { type: Number, default: 0 },
//     depositLimit: { type: Number, default: 0 },
//     purchaseStatus: { type: String, default: 'approved' }
// }, { _id: false });

const studentLocationSchema = new mongoose.Schema(
    {
        singletonKey: {
            type: String,
            default: "SINGLE_LOCATION",
            unique: true
        },
        locationName: String,
        schoolName: String,
        global_location_id: String,
        schoolCode:String,
        baseUrl:String,
        syncStatus: {
            type: String,
            enum: ["PENDING", "SYNCED", "FAILED"],
            default: "PENDING"
        },
        syncError: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
        // custodyLimits:[custodyLimitSchema]
    },
    {
        timestamps: true,
    }
);
const studentLocation = mongoose.model('StudentLocation', studentLocationSchema);
module.exports = studentLocation
