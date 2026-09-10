const jwt = require('jsonwebtoken');
const tokenBlacklist = require('../utils/blackList');
const userModel = require('../model/userModel');
const { default: axios } = require('axios');
const studentModel = require('../model/studentModel');
const { resolveLocationIdForDoc } = require("../utils/resolveUserLocation");
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  // let token  = token ? (authHeader && authHeader.split(' ')[1] ): (req.cookies.token);
  const token =
    (authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null) ||
    req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ message: "Token has been invalidated" });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    const userExist = await userModel.findById(user.id);
    if (!userExist) {
      return res.status(403).send({ success: false, message: "please check your credential (may be user deleted)" });
    }
    if (user.role === "student") {
      if (userExist.subscriptionEnd && userExist.subscriptionEnd < new Date()) {
        userExist.subscription = false;
        await userExist.save();
      }
      const studentData = await studentModel.findOne({ user_id: user.id })

      if (!userExist.subscription) {
        const data = await axios.put(`${process.env.GLOBAL_URL}/api/payment/update`, { studentId: studentData._id })
        return res.status(403).json({
          success: false,
          message: "Subscription expired. Please renew."
        });
      }
    }
    const effectiveLocation = await resolveLocationIdForDoc(userExist);
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      location_id: effectiveLocation,
    };
    next();
  });
};

const authenticateSuperAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ message: "Token has been invalidated" });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    if (user.role !== "SUPER ADMIN") {
      return res.status(403).send({ success: false, message: "you cannot access for this feature" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    next();
  });
}


module.exports = {
  authenticateToken,
  authenticateSuperAdmin
}
