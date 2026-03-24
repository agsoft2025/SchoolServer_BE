const jwt = require('jsonwebtoken');
const tokenBlacklist = require('../utils/blackList');
const userModel = require('../model/userModel');
const { default: axios } = require('axios');
const studentModel = require('../model/studentModel');
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
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


module.exports = authenticateToken;
