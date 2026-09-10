const sendLocationMissing = (res) => {
  return res.status(404).json({
    success: false,
    message: "Location not added yet. Please create a location before performing this action.",
  });
};

const requireUserLocation = (req, res) => {
  if (req.user?.role === "SUPER ADMIN") {
    return null;
  }
  if (!req.user?.location_id) {
    sendLocationMissing(res);
    return null;
  }
  return req.user.location_id;
};

module.exports = {
  requireUserLocation,
  sendLocationMissing,
};
