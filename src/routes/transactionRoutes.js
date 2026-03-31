const express = require('express');
const router = express.Router();
const { getTransactionsByRange } = require('../controllers/transactionController');

// GET /api/transactions?range=daily|weekly|monthly|yearly
router.get('/', getTransactionsByRange);

module.exports = router;