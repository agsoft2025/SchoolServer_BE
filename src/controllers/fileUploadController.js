const fileUploadModel = require("../model/fileUploadModel");
const fs = require('fs');
const path = require('path');


const fileUploadControllerFun = async(req,res)=>{
    try {
        const { remarks } = req.body;
    const userId = req.user.id;
    const uploadedFiles = [];

      if (req.files.files) {
      for (const file of req.files.files) {
        const doc = await fileUploadModel.create({
          uploaded_by: userId,
          original_name: file.originalname,
          file_name: file.filename,
          file_url: file.path,
          file_type: file.mimetype,
          remarks: remarks || null,
          file_category: 'document'
        });
        uploadedFiles.push(doc);
      }
    }

      // 🧑 Profile picture
    if (req.files.pro_pic && req.files.pro_pic[0]) {
      const file = req.files.pro_pic[0];
      const proPic = await fileUploadModel.create({
        uploaded_by: userId,
        original_name: file.originalname,
        file_name: file.filename,
        file_url: file.path,
        file_type: file.mimetype,
        remarks: 'Profile picture',
        file_category: 'pro_pic'
      });
      uploadedFiles.push(proPic);
    }

      return res.status(201).json({
      success: true,
      message: 'Files uploaded successfully',
      data: uploadedFiles
    });
        
    } catch (error) {
         return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
    }
}

const updateProPic = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;

    // 1️⃣ Check if file exists in DB
    const existingFile = await fileUploadModel.findById(fileId);
    if (!existingFile) {
        fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (!req.file) {
        fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'No new file uploaded' });
    }

    // 2️⃣ Save old file path in case rollback needed
    const oldFilePath = path.join(__dirname, '..', existingFile.file_url);

    // 3️⃣ Update DB first
    existingFile.original_name = req.file.originalname;
    existingFile.file_name = req.file.filename;
    existingFile.file_url = req.file.path;
    existingFile.file_type = req.file.mimetype;
    existingFile.uploaded_by = userId;
    existingFile.remarks = 'Profile picture updated';
    existingFile.file_category = 'pro_pic';

    await existingFile.save();

    // 4️⃣ Delete old file after DB update
    if (fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath.file_url);
    }

    return res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: existingFile
    });

  } catch (error) {
    // Rollback: if new file exists but update failed, delete the new file
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('Error updating profile picture:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};


module.exports = {fileUploadControllerFun,updateProPic}