const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 104857600; // 100MB

/**
 * Configure multer for file uploads
 * Uses memory storage to validate before saving to disk
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Single file upload
  },
  fileFilter: (req, file, cb) => {
    // Basic file type check (will be validated more thoroughly later)
    const ext = path.extname(file.originalname).toLowerCase();

    // Block dangerous extensions immediately
    const dangerousExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.sh', '.bat', '.cmd', '.com',
      '.pif', '.scr', '.vbs', '.jar', '.app', '.deb', '.rpm',
      '.msi', '.apk', '.dmg', '.bin'
    ];

    if (dangerousExtensions.includes(ext)) {
      return cb(new Error('Executable files are not allowed'), false);
    }

    cb(null, true);
  },
});

/**
 * Error handler for multer
 */
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        message: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file',
        message: 'Unexpected file in upload',
      });
    }

    return res.status(400).json({
      error: 'Upload error',
      message: err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      error: 'Upload error',
      message: err.message,
    });
  }

  next();
}

module.exports = {
  upload,
  handleMulterError,
};
