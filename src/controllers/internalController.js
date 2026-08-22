const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const userModel = require("../model/userModel");
const studentLocation = require("../model/studentLocationModel");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Called only by the Global server (via verifyInternalService) when a Super
// Admin creates a location directly from the Global panel instead of a
// school onboarding itself locally first. Creates the admin account and its
// location together so the location shows up in Add Admin immediately.
const provisionLocationAdmin = async (req, res) => {
  const {
    schoolName,
    locationName,
    baseUrl,
    schoolCode = "NOT_SET",
    global_location_id,
    username,
    fullname,
    password,
  } = req.body;

  if (!schoolName || !locationName || !baseUrl || !global_location_id) {
    return res.status(400).json({
      success: false,
      message: "schoolName, locationName, baseUrl and global_location_id are required",
    });
  }
  if (!username || !fullname || !password) {
    return res.status(400).json({
      success: false,
      message: "username, fullname and password are required",
    });
  }

  const usernameExist = await userModel.findOne({
    username: { $regex: `^${escapeRegex(username)}$`, $options: "i" },
  });
  if (usernameExist) {
    return res.status(409).json({ success: false, message: `username "${username}" already exists` });
  }

  const session = await mongoose.startSession();
  try {
    let createdUser, createdLocation;

    await session.withTransaction(async () => {
      const hashPassword = await bcrypt.hash(password, 10);

      [createdUser] = await userModel.create(
        [{ username, fullname, password: hashPassword, role: "ADMIN" }],
        { session }
      );

      [createdLocation] = await studentLocation.create(
        [
          {
            locationName: locationName.trim().toLowerCase(),
            schoolName,
            baseUrl,
            schoolCode,
            global_location_id,
            user_id: createdUser._id,
            createdBy: createdUser._id,
            updatedBy: createdUser._id,
            syncStatus: "SYNCED",
          },
        ],
        { session }
      );

      createdUser.location_id = createdLocation._id;
      await createdUser.save({ session });
    });

    return res.status(201).json({
      success: true,
      data: {
        adminId: createdUser._id,
        locationId: createdLocation._id,
        username: createdUser.username,
      },
    });
  } catch (error) {
    console.error("provisionLocationAdmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to provision admin and location",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

module.exports = { provisionLocationAdmin };
