const express = require('express');
const { searchFiles } = require('../services/fileService');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateSearch } = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * GET /api/search
 * Search files and folders
 */
router.get('/', requireAuth, validateSearch, async (req, res) => {
  try {
    const { q, mimeType, folderId, limit, offset } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query required',
        message: 'Please provide a search query',
      });
    }

    const results = await searchFiles(req.user.id, q, {
      mimeType,
      folderId,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });

    res.json({
      query: q,
      results,
      count: results.length,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Search failed',
      message: error.message,
    });
  }
});

module.exports = router;
