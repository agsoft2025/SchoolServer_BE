const express = require('express');
const { verifyWebhook, addWebhook, sendwhatsappsms } = require('../controllers/whatsapp.controller');
const router = express.Router();

router.get("/",verifyWebhook)
router.post("/",addWebhook)
router.get("/m",sendwhatsappsms)


module.exports = router;