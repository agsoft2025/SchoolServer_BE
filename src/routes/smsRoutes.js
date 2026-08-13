const express = require('express');
const {
  getClassGroups,
  previewRecipients,
  sendSms,
  getBatches,
  getBatchById,
  getBatchLogs,
  retryFailed,
} = require('../controllers/smsController');

const router = express.Router();

// SMS sends real money/reputational cost per click — restrict beyond the default authenticateToken gate.
const restrictToStaff = (req, res, next) => {
  const role = (req.user?.role || '').toUpperCase();
  if (!['ADMIN', 'SUPER ADMIN'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access SMS module' });
  }
  next();
};

router.use(restrictToStaff);

router.get('/class-groups', getClassGroups);
router.post('/preview', previewRecipients);
router.post('/send', sendSms);
router.get('/batches', getBatches);
router.get('/batches/:id', getBatchById);
router.get('/batches/:id/logs', getBatchLogs);
router.post('/batches/:id/retry-failed', retryFailed);

module.exports = router;
