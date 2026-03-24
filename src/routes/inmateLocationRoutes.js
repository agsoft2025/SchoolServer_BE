const express = require('express');
const { AddLocation, getAllLocation, updateLocation, deleteLocation } = require('../controllers/inmateLocationController');
const router = express.Router();

router.post("/",AddLocation)
router.get("/",getAllLocation)
router.put("/:id",updateLocation)
router.delete("/:id",deleteLocation)

module.exports = router;