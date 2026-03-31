const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const Inmate = require('../model/studentModel');
const Financial = require('../model/financialModel');
const logAudit = require('../utils/auditlogger');
const Department = require("../model/departmentModel");
const mongoose = require("mongoose");
const { checkTransactionLimit } = require('../utils/inmateTransactionLimiter');
const InmateSchema = require("../model/studentModel");
const userModel = require('../model/userModel');
const bcrypt = require('bcrypt');
const InmateLocation = require('../model/studentLocationModel');
const studentLocation = require('../model/studentLocationModel');
const studentModel = require('../model/studentModel');
const classModel = require('../model/classModel');
const moment = require("moment")
// const { parse } =require('date-fns');
const convertExcelDate = (excelDate) => {
  if (typeof excelDate === 'number') {
    // Convert Excel serial number to JS date
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return moment(date).format('DD-MM-YYYY'); // formatted as DD-MM-YYYY
  }
  // If already a string, try parsing
  const parsed = moment(excelDate, ['YYYY-MM-DD', 'DD-MM-YYYY']);
  if (parsed.isValid()) return parsed.format('DD-MM-YYYY');
  return null; // invalid date
};

const bulkUpsertInmates = async (req, res) => {
  try {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "denied" } }).then(async (_d) => {
      if (req.user.role !== 'SUPER ADMIN' && req.body.location !== req.user.location_id?.toString()) {
        return res.status(403).json({ message: 'Unauthorized to upsert inmates for this location' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      let inmates;
      const ext = req.file.originalname.split('.').pop().toLowerCase();

      if (ext === 'csv') {
        const csvString = req.file.buffer.toString('utf-8');
        inmates = parse(csvString, {
          columns: true,
          skip_empty_lines: true,
          trim: true
        });
      } else if (ext === 'xlsx') {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        inmates = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else {
        return res.status(400).json({ message: 'Unsupported file format' });
      }

      if (!Array.isArray(inmates) || inmates.length === 0) {
        return res.status(400).json({ message: 'Uploaded file contains no data' });
      }

      const results = {
        created: [],
        updated: [],
        failed: []
      };

      for (const inmate of inmates) {
        const {
          inmateId,
          firstName,
          lastName,
          balance,
          status,
          cellNumber,
          dateOfBirth,
          admissionDate,
          crimeType, custodyType,
          location_id,

        } = inmate;
        if (location_id !== req.body.location) {
          results.failed.push({ inmateId, reason: 'location id not matched' });
          continue;
        }
        if (
          !inmateId || !firstName || !lastName ||
          balance == null || !status || !cellNumber ||
          !dateOfBirth || !admissionDate || !crimeType
        ) {
          results.failed.push({ inmateId, reason: 'Missing required fields' });
          continue;
        }

        // const dob = parse(dateOfBirth, 'dd-MM-yyyy', new Date());
        // const admDate = parse(admissionDate, 'dd-MM-yyyy', new Date());

        const dob = new Date(dateOfBirth);
        const admDate = new Date(admissionDate);
        if (isNaN(dob) || isNaN(admDate)) {
          results.failed.push({ inmateId, reason: 'Invalid date format' });
          continue;
        }

        const existing = await Inmate.findOne({ inmateId: inmateId });

        if (existing) {
          const isModified =
            existing.firstName !== firstName ||
            existing.lastName !== lastName ||
            existing.balance !== parseFloat(balance) ||
            existing.status !== status ||
            existing.cellNumber !== cellNumber ||
            existing.dateOfBirth.getTime() !== dob.getTime() ||
            existing.admissionDate.getTime() !== admDate.getTime() ||
            existing.crimeType !== crimeType;
          existing.custodyType !== custodyType;
          existing.location_id !== location_id;

          if (isModified) {
            existing.firstName = firstName;
            existing.lastName = lastName;
            existing.balance = parseFloat(balance);
            existing.status = status;
            existing.cellNumber = cellNumber;
            existing.dateOfBirth = dob;
            existing.admissionDate = admDate;
            existing.crimeType = crimeType;
            existing.custodyType = custodyType;
            existing.location_id = location_id;

            await existing.save();
            results.updated.push(inmateId);
          }
        } else {
          const newInmate = new Inmate({
            inmateId: inmateId,
            firstName,
            lastName,
            balance: parseFloat(balance),
            status,
            cellNumber,
            dateOfBirth: dob,
            admissionDate: admDate,
            crimeType,
            location_id, custodyType
          });
          const savedInmate = await newInmate.save();
          results.created.push(inmateId);
          if (savedInmate) {
            const hashedPassword = await bcrypt.hash(inmateId, 10);
            const newUser = new userModel({ username: inmateId, fullname: inmateId, inmateId, password: hashedPassword, role: "INMATE", location_id });
            await newUser.save().then((data) => {

            }).catch((error) => {
              results.failed.push({ inmateId, reason: error.message });
            })
          }


        }
      }

      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: 'BULK_UPSERT',
        targetModel: 'Inmate',
        targetId: null,
        description: `Bulk upsert of inmates performed. Created: ${results.created.length}, Updated: ${results.updated.length}, Failed: ${results.failed.length}`,
        changes: results
      });

      return res.status(200).json({
        success: true,
        message: 'Bulk inmate operation completed',
        results
      });



    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  } finally {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "approved" } })

  }
};

const bulkUpsertStudents = async (req, res) => {

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { location_id } = req.body;
    if (!location_id) {
      return res.status(400).json({ success: false, message: "location_id required" });
    }
    if (req.user.role !== 'SUPER ADMIN' && location_id !== req.user.location_id?.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized location bulk upload" });
    }

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let students = [];

    if (ext === 'csv') {
      const csvString = req.file.buffer.toString('utf-8');
      students = parse(csvString, { columns: true, skip_empty_lines: true, trim: true });
    } else if (ext === 'xlsx') {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      students = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
      return res.status(400).json({ success: false, message: "Unsupported file format. Upload CSV or XLSX." });
    }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: "Uploaded file contains no data" });
    }

    const results = { created: [], skipped: [], failed: [] };

    for (const student of students) {
      const {
        Roll_no:registration_number,
        student_name,
        father_name,
        mother_name,
        gender,
        nationality,
        mother_tongue,
        blood_group,
        religion,
        class_name,
        section,
        academic_year,
        contact_number,
        descriptor,
        pro_pic,
        hostel_name,
        board_name
      } = student;
      // let date_of_birth = convertExcelDate(student.date_of_birth)


      // Validate required fields
      const missingFields = [];
      if (!hostel_name) missingFields.push("hostel_name");
      if (!board_name) missingFields.push("board_name");
      if (!registration_number) missingFields.push("registration_number");
      if (!student_name) missingFields.push("student_name");
      if (!father_name) missingFields.push("father_name");
      if (!mother_name) missingFields.push("mother_name");
      // if (!date_of_birth) missingFields.push("date_of_birth");
      if (!gender) missingFields.push("gender");
      if (!class_name) missingFields.push("class_name");
      if (!section) missingFields.push("section");
      if (!academic_year) missingFields.push("academic_year");
      if (!contact_number) missingFields.push("contact_number");
      // if (deposite_amount == null) missingFields.push("deposite_amount");

      if (missingFields.length > 0) {
        results.failed.push({ registration_number: registration_number || "N/A", reason: `Missing required fields: ${missingFields.join(", ")}` });
        continue;
      }

      // Validate gender
      if (!["Male", "Female", "Other"].includes(gender)) {
        results.failed.push({ registration_number, reason: `Invalid gender: ${gender}` });
        continue;
      }

      // Validate location
      const locationExists = await studentLocation.findById(location_id);
      if (!locationExists) {
        results.failed.push({ registration_number, reason: "Invalid location_id" });
        continue;
      }

      // Check existing student
      const existingStudent = await studentModel.findOne({ registration_number, location_id });
      if (existingStudent) {
        results.skipped.push({ registration_number, reason: "Duplicate registration_number — student already exists in this location" });
        continue;
      }

      // Check existing contact number
      if (contact_number) {
        const existingContact = await studentModel.findOne({ contact_number, location_id });
        if (existingContact) {
          results.skipped.push({ registration_number, reason: `Duplicate contact_number — mobile number ${contact_number} already exists in this location` });
          continue;
        }
      }

      // Create/find class
      let classData = await classModel.findOne({ class_name, section, academic_year });
      if (!classData) classData = await classModel.create({ class_name, section, academic_year });

      // Create user
      let savedUser;
      try {
        const hashedPassword = await bcrypt.hash(registration_number, 10);
        savedUser = await userModel.create({
          username: registration_number,
          fullname: student_name,
          password: hashedPassword,
          role: 'student',
          location_id,
          descriptor: descriptor || null
        });
      } catch (err) {
        results.failed.push({ registration_number, reason: `User creation failed: ${err.message}` });
        continue;
      }

      // Create student
      try {
        // const dob = moment(date_of_birth, ['YYYY-MM-DD', 'DD-MM-YYYY']).toDate();
        // if (!dob || isNaN(dob.getTime())) {
        //   results.failed.push({ registration_number, reason: "Invalid date_of_birth format" });
        //   if (savedUser) await userModel.findByIdAndDelete(savedUser._id);
        //   continue;
        // }

        const savedStudent = await studentModel.create({
          registration_number,
          student_name,
          father_name,
          mother_name,
          gender,
          hostel_name,
          board_name,
          deposite_amount:0,
          class_info: classData._id,
          location_id,
          contact_number,
          pro_pic: pro_pic || null,
          user_id: savedUser._id,
          created_by: req.user.id,
          updated_by: req.user.id
        });

        results.created.push({ registration_number, student_id: savedStudent._id });
      } catch (err) {
        if (savedUser) await userModel.findByIdAndDelete(savedUser._id);
        results.failed.push({ registration_number, reason: `Student creation failed: ${err.message}` });
      }
    }

    // Audit log
    if (req.user) {
      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: "BULK_UPLOAD",
        targetModel: "Student",
        targetId: null,
        description: `Bulk student upload — Created: ${results.created.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`,
        changes: results
      });
    }

    // Response
    return res.status(200).json({
      success: true,
      message: "Bulk student upload completed",
      summary: {
        totalRecords: students.length,
        created: results.created.length,
        skipped: results.skipped.length,
        failed: results.failed.length
      },
      details: results
    });

  } catch (error) {
    console.error("❌ Bulk upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during bulk upload",
      error: error.message
    });
  }
};

const bulkUpsertFinancial = async (req, res) => {
  try {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "denied" } }).then(async (_d) => {
      if (req.user.role !== 'SUPER ADMIN' && req.body.location !== req.user.location_id?.toString()) {
        return res.status(403).json({ message: 'Unauthorized to upsert financial records for this location' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      let records;

      if (ext === 'csv') {
        const csvString = req.file.buffer.toString('utf-8');
        records = parse(csvString, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ','
        });
      } else if (ext === 'xlsx') {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else {
        return res.status(400).json({ message: 'Unsupported file format' });
      }

      const results = {
        created: [],
        skipped: [],
        failed: []
      };

      for (const entry of records) {
        let {
          inmateId,
          custodyType,
          wageAmount,
          hoursWorked,
          transaction = "WEEKLY",
          workAssignId,
          type = "wages"
        } = entry;

        if (!inmateId || !custodyType || !type || !wageAmount || !hoursWorked || !transaction || !workAssignId) {
          results.failed.push({ inmateId, reason: 'Missing required fields' });
          continue;
        }

        const Departments = await Department.find({
          "name": workAssignId
        });

        if (!Departments.length) {
          results.failed.push({ inmateId, reason: 'Missing department', workAssignId });
          continue;
        }
        const checkLimit = await checkTransactionLimit(inmateId, parseInt(wageAmount), type)
        if (!checkLimit.status) {
          results.failed.push({ inmateId, reason: checkLimit.message, workAssignId });
          continue;
        }

        workAssignId = new mongoose.Types.ObjectId(Departments[0]._id);

        try {

          const wage = parseInt(wageAmount || 0);
          if (!wage || isNaN(wage)) {
            results.skipped.push(inmateId);
            continue;
          } else {
            const newEntry = new Financial({
              inmateId,
              transaction,
              workAssignId,
              hoursWorked: parseInt(hoursWorked || 0),
              wageAmount: wage,
              type,
              status: "ACTIVE",
              custodyType
            });

            await newEntry.save();
            if (wage > 0) {
              const inmate = await Inmate.findOne({ inmateId });
              if (inmate) {
                inmate.balance += wage;
                inmate.custodyType = custodyType;
                await inmate.save();
              } else {
                results.failed.push({ inmateId, reason: 'Inmate not found for balance update' });
                continue;
              }
            }
            results.created.push(inmateId);
          }
        } catch (err) {
          results.failed.push({ inmateId, reason: 'Save failed', error: err.message, custodyType });
        }
      }


      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: 'BULK_UPSERT',
        targetModel: 'Financial',
        targetId: null,
        description: `Bulk upsert of wages performed. Created: ${results.created.length}, Updated: ${results.skipped.length}, Failed: ${results.failed.length}`,
        changes: results
      });
      res.status(200).json({
        success: true,
        message: 'Bulk financial operation completed',
        results
      });



    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  } finally {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "approved" } })
  }
};

module.exports = { bulkUpsertInmates, bulkUpsertStudents, bulkUpsertFinancial };
