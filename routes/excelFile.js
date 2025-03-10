const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      // Check if file exists
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
  
      // Check GridFS connection
      if (!gfs) {
        return res.status(500).json({ error: 'Database connection not ready' });
      }
  
      const writeStream = gfs.openUploadStream(req.file.originalname);
      
      // Handle stream errors
      writeStream.on('error', (error) => {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
      });
  
      // Handle successful upload
      writeStream.end(req.file.buffer, async () => {
        res.status(201).json({
          id: writeStream.id,
          filename: req.file.originalname,
          url: `/api/files/${writeStream.id}`
        });
      });
  
    } catch (err) {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

// Get all files
router.get('/', async (req, res) => {
  try {
    const files = await gfs.find().toArray();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download file
router.get('/:id', async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const file = await gfs.find({ _id: fileId }).next();
    
    if (!file) return res.status(404).json({ error: 'File not found' });
    
    res.set('Content-Type', file.contentType);
    res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    
    const downloadStream = gfs.openDownloadStream(fileId);
    downloadStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;