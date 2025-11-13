const express = require('express');
const {
  createFolder,
  getFolderById,
  listFolders,
  getFolderContents,
  getFolderTree,
  getBreadcrumbs,
  renameFolder,
  deleteFolder,
  moveFolder,
} = require('../services/folderService');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  validateFolderCreate,
  validateFolderRename,
  validateUUID,
} = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * POST /api/folders
 * Create a new folder
 */
router.post('/', requireAuth, validateFolderCreate, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const folder = await createFolder(req.user.id, name, parentId || null, req.ip);

    res.status(201).json({
      message: 'Folder created successfully',
      folder,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to create folder',
      message: error.message,
    });
  }
});

/**
 * GET /api/folders/:id
 * Get folder by ID
 */
router.get('/:id', requireAuth, validateUUID, async (req, res) => {
  try {
    const folder = await getFolderById(req.params.id, req.user.id);

    res.json({ folder });
  } catch (error) {
    res.status(404).json({
      error: 'Folder not found',
      message: error.message,
    });
  }
});

/**
 * GET /api/folders
 * List folders
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { parentId, limit, offset, sortBy, sortOrder } = req.query;

    const folders = await listFolders(req.user.id, parentId || null, {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      sortBy: sortBy || 'name',
      sortOrder: sortOrder || 'ASC',
    });

    res.json({ folders, count: folders.length });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to list folders',
      message: error.message,
    });
  }
});

/**
 * GET /api/folders/:id/contents
 * Get folder contents (folders + files)
 */
router.get('/:id/contents', requireAuth, async (req, res) => {
  try {
    const folderId = req.params.id === 'root' ? null : req.params.id;
    const contents = await getFolderContents(req.user.id, folderId);

    res.json(contents);
  } catch (error) {
    res.status(400).json({
      error: 'Failed to get folder contents',
      message: error.message,
    });
  }
});

/**
 * GET /api/folders/:id/tree
 * Get folder tree structure
 */
router.get('/:id/tree', requireAuth, async (req, res) => {
  try {
    const folderId = req.params.id === 'root' ? null : req.params.id;
    const tree = await getFolderTree(req.user.id, folderId);

    res.json({ tree });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to get folder tree',
      message: error.message,
    });
  }
});

/**
 * GET /api/folders/:id/breadcrumbs
 * Get breadcrumb path for folder
 */
router.get('/:id/breadcrumbs', requireAuth, validateUUID, async (req, res) => {
  try {
    const breadcrumbs = await getBreadcrumbs(req.params.id, req.user.id);

    res.json({ breadcrumbs });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to get breadcrumbs',
      message: error.message,
    });
  }
});

/**
 * PUT /api/folders/:id
 * Rename folder
 */
router.put('/:id', requireAuth, validateFolderRename, async (req, res) => {
  try {
    const { name } = req.body;
    const folder = await renameFolder(req.params.id, req.user.id, name, req.ip);

    res.json({
      message: 'Folder renamed successfully',
      folder,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to rename folder',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/folders/:id
 * Delete folder (soft delete)
 */
router.delete('/:id', requireAuth, validateUUID, async (req, res) => {
  try {
    const result = await deleteFolder(req.params.id, req.user.id, req.ip);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: 'Failed to delete folder',
      message: error.message,
    });
  }
});

/**
 * POST /api/folders/:id/move
 * Move folder to different parent
 */
router.post('/:id/move', requireAuth, validateUUID, async (req, res) => {
  try {
    const { parentId } = req.body;
    const folder = await moveFolder(req.params.id, req.user.id, parentId, req.ip);

    res.json({
      message: 'Folder moved successfully',
      folder,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Failed to move folder',
      message: error.message,
    });
  }
});

module.exports = router;
