const express = require('express');
const { getAllAdmins, getAdminById, updateAdminById, deleteAdminById } = require('../controllers/adminController');
const { authenticateToken, authenticateSuperAdmin } = require('../middleware/authToken');
const router = express.Router();

// All admin routes require authentication
router.use(authenticateSuperAdmin);

// Get all admins with filters
router.get("/", getAllAdmins);

// Get single admin by ID
router.get("/:id", getAdminById);

// Update admin by ID (only super admin can update location)
router.put("/:id", updateAdminById);

// Delete admin by ID
router.delete("/:id", deleteAdminById);

module.exports = router;