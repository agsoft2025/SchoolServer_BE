const express = require('express');
const { createOrder, verifyPayment, parentCreatePayment, parentVerifyPayment } = require('../controllers/payment.controller');
const router = express.Router();
//gloabal server
router.post("/create",createOrder);
router.post("/verify",verifyPayment);

router.post("/parent/create",parentCreatePayment)
router.post("/parent/verify",parentVerifyPayment)


module.exports = router;