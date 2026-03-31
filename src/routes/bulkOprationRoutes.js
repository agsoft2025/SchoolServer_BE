// routes/auditRoutes.js
const express = require('express');
const { bulkUpsertInmates, bulkUpsertFinancial, bulkUpsertStudents } = require('../controllers/bulkOperationController');
const router = express.Router();

const multer = require('multer');
const storage = multer.memoryStorage(); // store file in memory
const upload = multer({ storage });


// router.post('/inmates', upload.single('file'), bulkUpsertInmates);
router.post('/students', upload.single('file'), bulkUpsertStudents);
router.post('/wages', upload.single('file'), bulkUpsertFinancial);

module.exports = router;
