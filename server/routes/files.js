const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configure file storage
const uploadDir = path.join(__dirname, '../uploads/files');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but sanitize it
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, sanitizedName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Allow zip and apk files
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip' || ext === '.apk') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip and .apk files are allowed'));
    }
  },
  limits: {
    fileSize: 150 * 1024 * 1024 // 150MB limit
  }
});

/**
 * POST /api/files/record
 * Record metadata for a release asset uploaded directly to Supabase Storage
 */
router.post('/record', async (req, res) => {
  try {
    const { filename, original_name, mime_type, size, app_category, download_url } = req.body;
    if (!app_category || !download_url) {
      return res.status(400).json({ error: 'app_category and download_url are required' });
    }

    const dbHelpers = req.app.get('dbHelpers');
    const result = dbHelpers.upsertFile(
      filename || original_name,
      original_name || filename,
      mime_type || 'application/octet-stream',
      size || 0,
      app_category,
      download_url
    );

    res.json({
      success: true,
      message: 'File recorded successfully',
      file: {
        id: result.lastInsertRowid,
        filename: filename || original_name,
        original_name: original_name || filename,
        size: size || 0,
        app_category,
        download_url
      }
    });
  } catch (error) {
    console.error('File record error:', error);
    res.status(500).json({ error: 'Failed to record file metadata' });
  }
});

/**
 * POST /api/files/upload
 * Fallback local server file upload
 */
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { app_category } = req.body;
      if (!app_category) {
        return res.status(400).json({ error: 'app_category is required' });
      }

      const dbHelpers = req.app.get('dbHelpers');
      const result = dbHelpers.upsertFile(
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        app_category
      );

      res.json({
        success: true,
        message: 'File uploaded successfully',
        file: {
          id: result.lastInsertRowid,
          filename: req.file.filename,
          original_name: req.file.originalname,
          size: req.file.size
        }
      });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

/**
 * GET /api/files
 * Get all files
 */
router.get('/', (req, res) => {
  try {
    const dbHelpers = req.app.get('dbHelpers');
    const files = dbHelpers.getAllFiles();
    res.json({ success: true, files });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

/**
 * GET /api/files/:id/download
 * Download a file
 */
router.get('/:id/download', (req, res) => {
  try {
    const dbHelpers = req.app.get('dbHelpers');
    const file = dbHelpers.getFileById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Direct redirect to Supabase high-speed CDN if available
    if (file.download_url) {
      return res.redirect(file.download_url);
    }

    const filePath = path.join(__dirname, '../uploads/files', file.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, file.original_name);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file
 */
router.delete('/:id', async (req, res) => {
  try {
    const dbHelpers = req.app.get('dbHelpers');
    const file = dbHelpers.getFileById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from database
    dbHelpers.deleteFile(req.params.id);

    // Delete from disk
    const filePath = path.join(__dirname, '../uploads/files', file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: 'File deleted successfully' });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
