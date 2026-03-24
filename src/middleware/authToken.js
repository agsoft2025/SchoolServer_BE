const jwt = require('jsonwebtoken');
const tokenBlacklist = require('../utils/blackList');
const userModel = require('../model/userModel');
const { default: axios } = require('axios');
const studentModel = require('../model/studentModel');
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken1 = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ message: "Token has been invalidated" });
  }

  jwt.verify(token, JWT_SECRET,async (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    const userExist = await userModel.findById(user.id);
    if(!userExist){
      return res.status(403).send({success:false,message:"please check your credential (may be user deleted)"});
    }
     if (user.role === "student") {
      if (userExist.subscriptionEnd && userExist.subscriptionEnd < new Date()) {
        userExist.subscription = false; 
        await userExist.save();
      }
      const studentData = await studentModel.findOne({user_id:user.id})
      
      if (!userExist.subscription) {
         const data = await axios.put(`${process.env.GLOBAL_URL}/api/payment/update`,{studentId:studentData._id})
        return res.status(403).json({
          success: false,
          message: "Subscription expired. Please renew."
        });
      }
    }
    req.user = {
      id: user.id,
      username: user.username,
      role:user.role
    };
    next();
  });
};

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    const token = req.cookies?.token || bearerToken;

    if (!token) {
      return res.status(401).json({ message: "Access token required" });
    }

    if (tokenBlacklist.has(token)) {
      return res.status(401).json({ message: "Token has been invalidated" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const userExist = await userModel.findById(decoded.id);

    if (!userExist) {
      return res.status(403).send({
        success: false,
        message: "User not found or deleted"
      });
    }

    // student subscription check
    if (decoded.role === "student") {

      if (userExist.subscriptionEnd && userExist.subscriptionEnd < new Date()) {
        userExist.subscription = false;
        await userExist.save();
      }

      const studentData = await studentModel.findOne({ user_id: decoded.id });

      if (!userExist.subscription) {
        await axios.put(`${process.env.GLOBAL_URL}/api/payment/update`, {
          studentId: studentData._id
        });

        return res.status(403).json({
          success: false,
          message: "Subscription expired. Please renew."
        });
      }
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };

    next();

  } catch (error) {
    return res.status(403).json({
      message: "Invalid or expired token"
    });
  }
};


module.exports = authenticateToken;
