const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const fileUploadController = require('../controllers/fileUploadController');

router.post(
  '/',
  upload.fields([
    { name: 'files', maxCount: 10 },  // multiple student documents
    { name: 'pro_pic', maxCount: 1 }  // single profile picture
  ]),
  fileUploadController.fileUploadControllerFun
);

router.put(
  '/:id', // id = existing file/document ID
  upload.single('pro_pic'), // single file for profile picture
  fileUploadController.updateProPic
);

module.exports = router;