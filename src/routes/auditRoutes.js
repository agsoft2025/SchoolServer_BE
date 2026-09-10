// routes/auditRoutes.js
const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditController');
const auditThrottle = require('../middleware/auditThrottle');

router.get('/', auditThrottle, getAuditLogs);

module.exports = router;
