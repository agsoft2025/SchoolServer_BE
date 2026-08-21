const globalServiceClient = require("../utils/globalServiceClient");
const studentLocation = require("../model/studentLocationModel");

async function syncToGlobal(location) {
  try {
    const payload = {
      externalId: location._id.toString(),
      name: location.schoolName,
      location: location.locationName,
      baseUrl: location.baseUrl,
      schoolCode:location.schoolCode
    };

    const res = await globalServiceClient.post("/api/location", payload);
    await studentLocation.findByIdAndUpdate(location._id, {
      global_location_id: res.data._id,
      syncStatus: "SYNCED"
    });

  } catch (err) {
    await studentLocation.findByIdAndUpdate(location._id, {
      syncStatus: "FAILED",
      syncError: err.message
    });
  }
}

async function syncUpdateToGlobal(location) {
  console.log("<><>working")
  console.log("<><>location",location)
  try {
    const payload = {
      name: location.schoolName,
      location: location.locationName,
      baseUrl: location.baseUrl
    };
console.log("<><>payload",payload)
console.log("process.env.GLOBAL_URL",process.env.GLOBAL_URL)
    const data = await globalServiceClient.put(
      `/api/location/${location._id.toString()}`,
      payload
    );
    console.log("Update response from global server:", data.data);

  } catch (err) {
    // do NOT throw
    await studentLocation.findByIdAndUpdate(location._id, {
      syncStatus: "FAILED",
      syncError: err.message
    });
    console.log("Error syncing update to global server:", err);
  }
}

module.exports = {
    syncToGlobal, syncUpdateToGlobal
}