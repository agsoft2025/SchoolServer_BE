const express = require('express');
const { createStudentData, fetchStudentData, updateStudentData, deleteStudentData, getSingleStudentData } = require('../controllers/student.controller');
const router = express.Router();

router.post("/",createStudentData)
router.get("/",fetchStudentData)
router.put("/:id",updateStudentData)
router.delete("/:id",deleteStudentData)
router.get("/:id",getSingleStudentData)

module.exports = router