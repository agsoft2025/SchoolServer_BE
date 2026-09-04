const express = require('express');
const { AddLocation, getAllLocation, updateLocation, deleteLocation, adminUpdateLocation } = require('../controllers/studentLocationController');
const {authenticateToken} = require('../middleware/authToken');
const blockLocalAdminLocationWrite = require('../middleware/blockLocalAdminLocationWrite');
const router = express.Router();

router.use(authenticateToken)
router.get("/",getAllLocation)
// Writes are Super-Admin-only; a Local Admin can only view their assigned location.
router.post("/", blockLocalAdminLocationWrite, AddLocation)
router.put("/:id", blockLocalAdminLocationWrite, updateLocation)
router.delete("/:id", blockLocalAdminLocationWrite, deleteLocation)

router.post("/admin/:id", blockLocalAdminLocationWrite, adminUpdateLocation)

module.exports = router;