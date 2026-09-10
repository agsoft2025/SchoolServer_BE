const studentLocation = require("../model/studentLocationModel");

// Called only by the Global server (via verifyInternalService) when a Super
// Admin creates a location from the Global panel. It only mirrors the location
// down to this local server (keyed by global_location_id, idempotent) so the
// school shows up in the "Add Admin" dropdown. No admin account is created here
// anymore — the Super Admin attaches admins afterwards from the Admin screen.
const provisionLocationAdmin = async (req, res) => {
  const { schoolName, locationName, schoolCode = "NOT_SET", global_location_id } = req.body;

  // Base URL is no longer configured per location; one common URL is shared by
  // all local servers.
  const baseUrl = req.body.baseUrl || process.env.COMMON_BASE_URL || "";

  if (!schoolName || !locationName || !global_location_id) {
    return res.status(400).json({
      success: false,
      message: "schoolName, locationName and global_location_id are required",
    });
  }

  try {
    const location = await studentLocation.findOneAndUpdate(
      { global_location_id },
      {
        $set: {
          schoolName,
          locationName: locationName.trim().toLowerCase(),
          baseUrl,
          schoolCode,
          syncStatus: "SYNCED",
          syncError: null,
        },
        $setOnInsert: { global_location_id },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      data: { locationId: location._id },
    });
  } catch (error) {
    console.error("provisionLocationAdmin (location sync) error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to sync location",
      error: error.message,
    });
  }
};

module.exports = { provisionLocationAdmin };
