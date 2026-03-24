const FinancialSchema = require("../model/financialModel");
const InmateSchema = require("../model/studentModel");
const mongoose = require("mongoose");
const logAudit = require("../utils/auditlogger");
const { Parser } = require('json2csv');
const { checkTransactionLimit } = require("../utils/inmateTransactionLimiter");
const inmateModel = require("../model/studentModel");
const departmentModel = require("../model/departmentModel");
const studentModel = require("../model/studentModel");
const financialModel = require("../model/financialModel");
const moment = require('moment');

const downloadWagesCSV1 = async (req, res) => {
  try {
    const studentData = await studentModel.find()
    if (!studentData || studentData.length === 0) {
      return res.status(404).json({ message: 'No wage records found to export' });
    }
    const formattedData = studentData.map(student => ({
      registration_number: student.registration_number,
      student_name: student.student_name,
      custodyType: student.custodyType,
      wageAmount: 0, hoursWorked: 0,
      transaction: "WEEKLY",
      type: "wages"
    }))

    const fields = [
      'studentId',
      'custodyType',
      'wageAmount',
      'hoursWorked',
      'transaction',
      'type'
    ];


    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedData);

    res.setHeader('Content-Disposition', 'attachment; filename=wages.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).end(csv);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export wages CSV', error: err.message });
  }
};

const downloadWagesCSV2 = async (req, res) => {
  try {
    const {student_id,format} = req.query
    let financialData;
    if (student_id) {
      financialData = await financialModel
        .find({ student_id })
        .populate("student_id");
      financialData.sort((a, b) =>
        a.student_id.registration_number.localeCompare(b.student_id.registration_number)
      );

    } else {
      financialData = await financialModel.aggregate([
        {
          $lookup: {
            from: "students",
            localField: "student_id",
            foreignField: "_id",
            as: "student_id"
          }
        },
        { $unwind: "$student_id" },
        { $sort: { "student.registration_number": 1 } }
      ]);
    }


    if (!financialData || financialData.length === 0) {
      return res.status(404).json({ message: 'No wage records found to export' });
    }

    // fetch all data 
    const formattedData = financialData.map(student => ({
      registration_number: student.student_id.registration_number,
      student_name: student.student_id.student_name,
      depositAmount: student.depositAmount,
      current_balace: student.student_id.deposite_amount,
      depositor_name: student.depositedBy,
      contact_number: student.contactNumber,
       created_at: moment(student.createdAt).format('YYYY-MM-DD HH:mm:ss')
    }))

    const fields = [
      'registration_number',
      'student_name',
      'depositAmount',
      'current_balace',
      'depositor_name',
      'contact_number',
      'created_at'
    ];


    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedData);

    res.setHeader('Content-Disposition', 'attachment; filename=wages.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).end(csv);

    res.status(200).send("csv");
  } catch (err) {
    res.status(500).json({ message: 'Failed to export wages CSV', error: err.message });
  }
};

const downloadWagesCSV = async (req, res) => {
  try {
    const { student_id, format } = req.query;
    let financialData;

    if (student_id) {
      financialData = await financialModel
        .find({ student_id })
        .populate("student_id");

      financialData.sort((a, b) =>
        a.student_id.registration_number.localeCompare(b.student_id.registration_number)
      );
    } else {
      financialData = await financialModel.aggregate([
        {
          $lookup: {
            from: "students",
            localField: "student_id",
            foreignField: "_id",
            as: "student_id"
          }
        },
        { $unwind: "$student_id" },
        { $sort: { "student_id.registration_number": 1 } } // ✅ fixed field name
      ]);
    }

    if (!financialData || financialData.length === 0) {
      return res.status(404).json({ message: 'No wage records found to export' });
    }

    // Format the data
    const formattedData = financialData.map(student => ({
      registration_number: student.student_id.registration_number,
      student_name: student.student_id.student_name,
      depositAmount: student.depositAmount,
      current_balance: student.student_id.deposite_amount,
      depositor_name: student.depositedBy,
      contact_number: student.contactNumber,
      created_at: moment(student.createdAt).format('YYYY-MM-DD HH:mm:ss')
    }));

    // Return JSON if requested
    if (format && format.toLowerCase() === 'json') {
      return res.status(200).json({
        success: true,
        count: formattedData.length,
        data: formattedData
      });
    }

    // Otherwise, return CSV by default
    const fields = [
      'registration_number',
      'student_name',
      'depositAmount',
      'current_balance',
      'depositor_name',
      'contact_number',
      'created_at'
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedData);

    res.setHeader('Content-Disposition', 'attachment; filename=wages.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).end(csv);

  } catch (err) {
    res.status(500).json({
      message: 'Failed to export wages data',
      error: err.message
    });
  }
};

// const createFinancial = async (req, res) => {
//   try {
//     const { inmateId, workAssignId, hoursWorked, wageAmount, transaction,
//       depositName, status, relationShipId, type, depositAmount } = req.body;
//     const depositLim = await checkTransactionLimit(inmateId, type === "wages" ? wageAmount : depositAmount, type);

//     if (!depositLim.status) {
//       return res.status(400).send({ success: false, message: depositLim.message });
//     }

//     if (type == 'wages') {

//       if (!inmateId || !workAssignId || !hoursWorked || !wageAmount || !type || !transaction) {
//         return res.status(400).json({ message: "Missing required fields" });
//       }
//     } else if (type == 'deposit') {
//       if (!inmateId || !depositName || !type || !depositAmount || !relationShipId) {
//         return res.status(400).json({ message: "Missing required fields" });
//       }
//     } else {
//       return res.status(400).json({ message: "Type is missing or incorrect" });
//     }

//     const inmate = await InmateSchema.findOne({ inmateId });
//     if (!inmate) {
//       return res.status(404).json({ message: "Inmate not found" });
//     }

//     let amountToAdd = 0;
//     if (type === 'wages') {
//       amountToAdd = wageAmount || 0;
//     } else if (type === 'deposit') {
//       amountToAdd = depositAmount || 0;
//     }

//     inmate.balance += amountToAdd;
//     await inmate.save();

//     const financial = new FinancialSchema({
//       inmateId,
//       custodyType: inmate.custodyType,
//       workAssignId,
//       hoursWorked,
//       wageAmount,
//       transaction,
//       status,
//       type,
//       relationShipId,
//       depositAmount,
//       depositName
//     });

//     const savedFinancial = await financial.save();
//     await logAudit({
//       userId: req.user.id,
//       username: req.user.username,
//       action: 'CREATE',
//       targetModel: 'Financial',
//       targetId: savedFinancial._id,
//       description: `Created ${type} record for inmate ${inmateId}`,
//       changes: { ...req.body, custodyType: inmate.custodyType }
//     });

//     res.status(201).json({ success: true, data: savedFinancial, message: "Financial " + type + " successfully created" });
//   } catch (error) {
//     res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//   }
// };
const createFinancial1 = async (req, res) => {
  try {
    const { inmateId, workAssignId, hoursWorked, wageAmount, transaction,
      depositType, status, relationShipId, type, depositAmount } = req.body;

    if (!depositLim.status) {
      return res.status(400).send({ success: false, message: depositLim.message });
    }

    if (type == 'wages') {

      if (!inmateId || !workAssignId || !hoursWorked || !wageAmount || !type || !transaction) {
        return res.status(400).json({ message: "Missing required fields" });
      }
    } else if (type == 'deposit') {
      if (!inmateId || !depositType || !type || !depositAmount || !relationShipId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
    } else if (type == 'withdrawal') {
      if (!inmateId || !depositType || !type || !depositAmount || !relationShipId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
    } else {
      return res.status(400).json({ message: "Type is missing or incorrect" });
    }

    const inmate = await InmateSchema.findOne({ inmateId });
    if (!inmate) {
      return res.status(404).json({ message: "Inmate not found" });
    }

    let amountToAdd = 0;
    if (type === 'wages') {
      amountToAdd = wageAmount || 0;
    } else if (type === 'deposit') {
      amountToAdd = depositAmount || 0;
    } else if (type === 'withdrawal') {
      amountToAdd = depositAmount || 0;
    }

    if (type === 'withdrawal') {
      inmate.balance -= amountToAdd
    } else {
      inmate.balance += amountToAdd;
    }
    await inmate.save();

    const financial = new FinancialSchema({
      inmateId,
      custodyType: inmate.custodyType,
      workAssignId,
      hoursWorked,
      wageAmount,
      transaction,
      status,
      type,
      relationShipId,
      depositAmount,
      depositType
    });

    const savedFinancial = await financial.save();
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE',
      targetModel: 'Financial',
      targetId: savedFinancial._id,
      description: `Created ${type} record for inmate ${inmateId}`,
      changes: { ...req.body, custodyType: inmate.custodyType }
    });

    res.status(201).json({ success: true, data: savedFinancial, message: "Financial " + type + " successfully created" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const createFinancial = async (req, res) => {
  try {
    const {
      student_id,
      hoursWorked,
      wageAmount,
      transaction,
      depositType,
      status,
      relationShipId,
      type,
      depositAmount,
      depositedBy,
      depositedById,
      contactNumber,
      remarks
    } = req.body;

    // 🧭 1. Basic validation for transaction type
    if (!type) {
      return res.status(400).json({ success: false, message: "Transaction type is required" });
    }

    // 📝 3. Type-specific required field validation
    if (type === 'wages') {
      if (!student_id || !hoursWorked || !wageAmount || !transaction) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for wages"
        });
      }
    } else if (type === 'deposit') {
      if (!student_id || !depositType || !depositAmount || !relationShipId || !depositedBy) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for deposit"
        });
      }
    } else if (type === 'withdrawal') {
      if (!student_id || !depositType || !depositAmount || !relationShipId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for withdrawal"
        });
      }
    } else {
      return res.status(400).json({ success: false, message: "Invalid transaction type" });
    }

    // 📌 4. Check if student exists
    const student = await studentModel.findById(student_id); // ⚠️ Replace `InmateSchema` with your actual Student Model
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 💰 5. Calculate and update balance
    let amountToChange = 0;
    if (type === 'wages') {
      amountToChange = Number(wageAmount) || 0;
      student.balance += amountToChange;
    } else if (type === 'deposit') {
      amountToChange = Number(depositAmount) || 0;
      student.balance += amountToChange;
    } else if (type === 'withdrawal') {
      amountToChange = Number(depositAmount) || 0;

      if (student.balance < amountToChange) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance for withdrawal"
        });
      }

      student.balance -= amountToChange;
    }

    await student.save();

    // // 👤 6. Handle depositor info (insider or outsider)
    // 🧾 7. Create financial transaction record
    const financial = new FinancialSchema({
      student_id,
      custodyType: student.custodyType || "student",
      hoursWorked,
      wageAmount,
      transaction,
      status,
      type,
      relationShipId,
      depositAmount,
      depositType,
      depositedBy,
      depositedById: depositedById || null,
      contactNumber: contactNumber || null,
      remarks: remarks || null
    });

    const savedFinancial = await financial.save();

    if (type === "deposit") {
      const deposit = student.deposite_amount + depositAmount;
      await studentModel.findByIdAndUpdate(student_id, { deposite_amount: deposit })
    }
    // 🪵 8. Log Audit trail
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE',
      targetModel: 'Financial',
      targetId: savedFinancial._id,
      description: `Created ${type} transaction for student ${student_id}`,
      changes: {
        ...req.body,
        custodyType: student.custodyType,
        finalBalance: student.balance
      }
    });
    // ✅ 9. Response
    res.status(201).json({
      success: true,
      data: savedFinancial,
      message: `Financial ${type} transaction successfully created`
    });

  } catch (error) {
    console.error("❌ Error in createFinancial:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


const getFinancial = async (req, res) => {
  try {
    const inmates = await FinancialSchema.find().sort({ createdAt: -1 });
    if (!inmates) {
      return res.status(404).json({ success: false, message: "No data found", data: [] })
    }
    res.status(200).json({ success: true, data: inmates, message: "Financial successfully fetched" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}

const getFinancialID = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "ID is missing" })
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    const findFinancial = await FinancialSchema.findById(id);
    if (!findFinancial) {
      return res.status(404).json({ message: "No data found" });
    }
    res.status(200).json({ success: true, data: findFinancial, message: "Financial successfully fetched" })
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}

const updateFinancial = async (req, res) => {
  try {
    const { id } = req.params;
    const updateBody = req.body;

    if (!id) {
      return res.status(400).json({ message: "ID is missing" })
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const original = await FinancialSchema.findById(id);
    if (!original) return res.status(404).json({ message: "No data found" });

    const updatedFinancial = await FinancialSchema.findByIdAndUpdate(
      id,
      updateBody,
      { new: true, runValidators: true }
    );
    if (!updatedFinancial) {
      return res.status(404).json({ message: "No data found" });
    }

    if (original.type === 'wages' || original.type === 'deposit') {
      const inmate = await InmateSchema.findOne({ inmateId: original.inmateId });
      if (inmate) {
        let oldAmount = original.type === 'wages' ? original.wageAmount : original.depositAmount;
        let newAmount = updateBody.wageAmount || updateBody.depositAmount || 0;

        const delta = newAmount - oldAmount;
        inmate.balance += delta;
        await inmate.save();
      }
    }
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UPDATE',
      targetModel: 'Financial',
      targetId: id,
      description: `Updated financial record for inmate ${updatedFinancial.inmateId}`,
      changes: updatedFinancial
    });
    res.status(200).json({ success: true, data: updatedFinancial, message: "Financial update successfully" })
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}

const deleteFinancial = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "ID is missing" })
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    const updatedFinancial = await FinancialSchema.findByIdAndDelete(id);
    if (!updatedFinancial) {
      return res.status(404).json({ message: "No data found" });
    }

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELETE',
      targetModel: 'Financial',
      targetId: updatedFinancial._id,
      description: `Deleted financial record for inmate ${updatedFinancial.inmateId}`,
      changes: updatedFinancial.toObject()
    });

    res.status(200).json({ success: true, message: "Financial successfully deleted" })
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}

const searchFinancial = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query is required" });
    }

    const regex = new RegExp(query, "i"); // 'i' makes it case-insensitive

    const results = await FinancialSchema.find({
      $or: [
        { inmateId: regex },
        { firstName: regex },
        { lastName: regex },
        { cellNumber: regex },
      ]
    });

    res.status(200).json({ success: true, data: results });

  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};


module.exports = { createFinancial, getFinancial, getFinancialID, updateFinancial, deleteFinancial, searchFinancial, downloadWagesCSV };