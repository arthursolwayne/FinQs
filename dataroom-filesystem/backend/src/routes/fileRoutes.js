const express = require('express');
const {
  uploadFile,
  getFileById,
  listFiles,
  downloadFile,
  deleteFile,
  restoreFile,
  moveFile,
  getStorageStats,
} = require('../services/fileService');
const { checkStorageQuota } = require('../services/authService');
const { generatePreview, getPreviewData } = require('../services/previewService');
const { requireAuth } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimitMiddleware');
const { upload, handleMulterError } = require('../middleware/uploadMiddleware');
const { validateFileUpload, validateUUID } = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * POST /api/files/upload
 * Upload a file
 */
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  handleMulterError,
  validateFileUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file provided',
          message: 'Please provide a file to upload',
        });
      }

      const { folderId } = req.body;
      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname;
      const userId = req.user.id;
      const ipAddress = req.ip;

      // Check storage quota
      await checkStorageQuota(userId, fileBuffer.length);

      // Upload file
      const file = await uploadFile(
        fileBuffer,
        originalName,
        userId,
        folderId || null,
        ipAddress
      );

      // Generate preview asynchronously (don't wait)
      generatePreview(file.id, file.storage_path, file.mime_type).catch(err =>
        console.error('Preview generation failed:', err)
      );

      res.status(201).json({
        message: 'File uploaded successfully',
        file,
      });
    } catch (error) {
      res.status(400).json({
        error: 'Upload failed',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/files/:id
 * Get file metadata
 */
router.get('/:id', requireAuth, validateUUID, async (req, res) => {
  try {
    const file = await getFileById(req.params.id, req.user.id);

    res.json({ file });
  } catch (error) {
    res.status(404).json({
      error: 'File not found',
      message: error.message,
    });
  }
});

/**
 * GET /api/files
 * List files
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { folderId, limit, offset, sortBy, sortOrder } = req.query;

    const files = await listFiles(req.user.id, folderId || null, {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      sortBy: sortBy || 'created_at',
      sortOrder: sortOrder || 'DESC',
    });

    res.json({ files, count: files.length });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to list files',
      message: error.message,
    });
  }
});

/**
 * GET /api/files/:id/download
 * Download file
 */
router.get('/:id/download', requireAuth, validateUUID, async (req, res) => {
  try {
    const fileData = await downloadFile(req.params.id, req.user.id, req.ip);

    res.download(fileData.path, fileData.filename, {
      headers: {
        'Content-Type': fileData.mimeType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    res.status(404).json({
      error: 'Download failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/files/:id/preview
 * Get file preview data
 */
router.get('/:id/preview', requireAuth, validateUUID, async (req, res) => {
  try {
    const previewData = await getPreviewData(req.params.id, req.user.id);

    // If preview is available, serve it
    if (previewData.previewPath) {
      res.sendFile(previewData.previewPath, { root: '/' });
    } else {
      res.json({
        message: 'Preview not available',
        ...previewData,
      });
    }
  } catch (error) {
    res.status(404).json({
      error: 'Preview failed',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/files/:id
 * Delete file (soft delete)
 */
router.delete('/:id', requireAuth, validateUUID, async (req, res) => {
  try {
    const result = await deleteFile(req.params.id, req.user.id, req.ip);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: 'Delete failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/files/:id/restore
 * Restore deleted file
 */
router.post('/:id/restore', requireAuth, validateUUID, async (req, res) => {
  try {
    const file = await restoreFile(req.params.id, req.user.id, req.ip);

    res.json({
      message: 'File restored successfully',
      file,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Restore failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/files/:id/move
 * Move file to different folder
 */
router.post('/:id/move', requireAuth, validateUUID, async (req, res) => {
  try {
    const { folderId } = req.body;
    const file = await moveFile(req.params.id, req.user.id, folderId, req.ip);

    res.json({
      message: 'File moved successfully',
      file,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Move failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/files/stats/storage
 * Get storage statistics
 */
router.get('/stats/storage', requireAuth, async (req, res) => {
  try {
    const stats = await getStorageStats(req.user.id);

    res.json({ stats });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to get stats',
      message: error.message,
    });
  }
});

module.exports = router;
