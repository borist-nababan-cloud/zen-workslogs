const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseHAVE_DONE, smartMergeEntries } = require('../parser');

const router = express.Router();

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'havedone-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept .md and .txt files
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.md' && ext !== '.txt') {
      return cb(new Error('Only .md and .txt files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

/**
 * POST /api/upload
 * Upload and process HAVE_DONE.md file
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read file content
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse the markdown content
    const parsedEntries = parseHAVE_DONE(content);

    if (parsedEntries.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No valid entries found in file' });
    }

    // Get database helpers from app (set in server.js)
    const dbHelpers = req.app.get('dbHelpers');

    // Smart merge with database
    const stats = smartMergeEntries(parsedEntries, dbHelpers);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'File processed successfully',
      stats,
      preview: parsedEntries.slice(0, 3) // Return first 3 entries as preview
    });

  } catch (error) {
    console.error('Upload error:', error);
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process file: ' + error.message });
  }
});

/**
 * GET /api/upload/parse
 * Parse file without saving to database (preview only)
 */
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const parsedEntries = parseHAVE_DONE(content);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      entries: parsedEntries,
      count: parsedEntries.length
    });

  } catch (error) {
    console.error('Parse error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to parse file: ' + error.message });
  }
});

module.exports = router;
