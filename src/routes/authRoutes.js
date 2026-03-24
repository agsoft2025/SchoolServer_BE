const express = require('express');
const { login, logout, verifyOTP } = require('../controllers/authController');
const authenticateToken = require('../middleware/authToken');
const { defaultUser } = require('../controllers/usersController');
const router = express.Router();

router.post("/login",login);
router.post("/verify",verifyOTP)
router.post("/logout",authenticateToken,logout);
router.get("/default",defaultUser)

module.exports = router;