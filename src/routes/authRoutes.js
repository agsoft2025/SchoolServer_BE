const express = require('express');
const { login, logout, verifyOTP } = require('../controllers/authController');
const { defaultUser, superAdminCreate } = require('../controllers/usersController');
const { authenticateToken, authenticateSuperAdmin } = require('../middleware/authToken');
const router = express.Router();

router.post("/login",login);
router.post("/verify",verifyOTP)
router.post("/logout",authenticateToken,logout);
router.get("/default",defaultUser)
router.post("/admin/create",authenticateSuperAdmin,superAdminCreate)

module.exports = router;