const express = require('express');
const { registerFaceID, loginFaceID } = require('../controllers/faceRecognationController');
const router = express.Router();

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });


router.post("/register-face",upload.single("face"),registerFaceID)
router.post("/login-face",upload.single("face"),loginFaceID)


module.exports = router;