const express = require('express');
const { createStudent, getStudents, updateStudent, searchInmates, deleteInmate, downloadInmatesCSV, getInmateUsingInmateID,getStudentTransactionData, getInmateTransactionData, fetchInmateDataUsingFace, getStudentById, getStudentByData, downloadStudentsCSV, getStudentByIdProfile } = require('../controllers/studentControllers');
const authenticateToken = require('../middleware/authToken');
const router = express.Router();
router.get('/info/:id',getStudentByIdProfile);

router.use(authenticateToken)
router.post("/create",createStudent);
router.get('/',getStudents);
router.get('/profile/:regNo',getStudentByData);
// router.get('/download-csv/:id', downloadInmatesCSV);
router.get('/download-csv/:id', downloadStudentsCSV);
router.get('/search',searchInmates);
router.post('/fetch-by-face',fetchInmateDataUsingFace)
router.get('/student-transaction/:id',getStudentTransactionData);
router.get('/:id',getStudentById);
router.put('/:id',updateStudent);
router.delete('/:id',deleteInmate);

module.exports = router;