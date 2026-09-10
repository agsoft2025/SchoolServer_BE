const express = require('express');
const { getAllAdmins, getAdminById, updateAdminById, deleteAdminById, getLocationsForAdmin } = require('../controllers/adminController');
const { authenticateToken, authenticateSuperAdmin } = require('../middleware/authToken');
const router = express.Router();

// All admin routes require authentication
router.use(authenticateSuperAdmin);

// Locations available to assign a new/existing admin to
router.get("/locations", getLocationsForAdmin);

// Get all admins with filters
router.get("/", getAllAdmins);

// Get single admin by ID
router.get("/:id", getAdminById);

// Update admin by ID (only super admin can update location)
router.put("/:id", updateAdminById);

// Delete admin by ID
router.delete("/:id", deleteAdminById);

module.exports = router;