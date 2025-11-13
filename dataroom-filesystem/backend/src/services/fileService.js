const fs = require('fs').promises;
const path = require('path');
const { query, getClient } = require('../db/database');
const {
  sanitizeFilename,
  generateStoragePath,
  calculateFileHash,
  validatePath,
} = require('../utils/filenameSanitizer');
const {
  validateMimeType,
  blockExecutableExtensions,
  checkDoubleExtension,
  getFileCategory,
} = require('../utils/mimeValidator');
const { createAuditLog } = require('./auditService');

/**
 * Upload a file
 */
async function uploadFile(fileBuffer, originalName, userId, folderId, ipAddress) {
  // Security validations
  blockExecutableExtensions(originalName);
  checkDoubleExtension(originalName);

  // Sanitize filename
  const sanitizedName = sanitizeFilename(originalName);

  // Calculate content hash
  const contentHash = calculateFileHash(fileBuffer);

  // Detect and validate MIME type
  const detectedType = await validateMimeType(fileBuffer, null, originalName);

  // Check if file already exists (deduplication)
  const existingFile = await query(
    'SELECT id, storage_path FROM files WHERE content_hash = $1 AND user_id = $2 AND is_deleted = FALSE LIMIT 1',
    [contentHash, userId]
  );

  let storagePath;
  let fileSize = fileBuffer.length;

  // If file doesn't exist, write to filesystem
  if (existingFile.rows.length === 0) {
    const ext = path.extname(originalName);
    storagePath = generateStoragePath(contentHash, ext, process.env.UPLOAD_DIR);

    // Create directory if it doesn't exist
    const dir = path.dirname(storagePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(storagePath, fileBuffer, { mode: 0o644 });
  } else {
    // Reuse existing file storage
    storagePath = existingFile.rows[0].storage_path;
  }

  // Insert file record in database
  const result = await query(
    `INSERT INTO files (
      user_id, folder_id, original_name, sanitized_name,
      content_hash, storage_path, mime_type, size, extension
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, user_id, folder_id, original_name, sanitized_name,
              mime_type, size, extension, created_at`,
    [
      userId,
      folderId,
      originalName,
      sanitizedName,
      contentHash,
      storagePath,
      detectedType.mime,
      fileSize,
      detectedType.ext,
    ]
  );

  const file = result.rows[0];

  // Create audit log
  await createAuditLog({
    userId,
    action: 'upload',
    resourceType: 'file',
    resourceId: file.id,
    ipAddress,
    metadata: {
      filename: originalName,
      size: fileSize,
      mimeType: detectedType.mime,
    },
  });

  return file;
}

/**
 * Get file by ID
 */
async function getFileById(fileId, userId) {
  const result = await query(
    `SELECT f.*,
            fo.name as folder_name,
            fo.path as folder_path
     FROM files f
     LEFT JOIN folders fo ON f.folder_id = fo.id
     WHERE f.id = $1 AND f.user_id = $2 AND f.is_deleted = FALSE`,
    [fileId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('File not found or access denied');
  }

  return result.rows[0];
}

/**
 * List files in a folder
 */
async function listFiles(userId, folderId = null, options = {}) {
  const {
    limit = 100,
    offset = 0,
    sortBy = 'created_at',
    sortOrder = 'DESC',
  } = options;

  const result = await query(
    `SELECT id, original_name, sanitized_name, mime_type, size,
            extension, preview_path, created_at, updated_at
     FROM files
     WHERE user_id = $1 AND folder_id ${folderId ? '= $2' : 'IS NULL'} AND is_deleted = FALSE
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $3 OFFSET $4`,
    folderId ? [userId, folderId, limit, offset] : [userId, limit, offset]
  );

  return result.rows;
}

/**
 * Download file - returns file path
 */
async function downloadFile(fileId, userId, ipAddress) {
  const file = await getFileById(fileId, userId);

  // Create audit log
  await createAuditLog({
    userId,
    action: 'download',
    resourceType: 'file',
    resourceId: fileId,
    ipAddress,
    metadata: {
      filename: file.original_name,
      size: file.size,
    },
  });

  return {
    path: file.storage_path,
    filename: file.original_name,
    mimeType: file.mime_type,
  };
}

/**
 * Delete file (soft delete)
 */
async function deleteFile(fileId, userId, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check if user owns the file
    const fileResult = await client.query(
      'SELECT id, original_name, size FROM files WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      throw new Error('File not found or already deleted');
    }

    const file = fileResult.rows[0];

    // Soft delete
    await client.query(
      'UPDATE files SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1',
      [fileId]
    );

    // Create audit log
    await createAuditLog({
      userId,
      action: 'delete',
      resourceType: 'file',
      resourceId: fileId,
      ipAddress,
      metadata: {
        filename: file.original_name,
      },
    });

    await client.query('COMMIT');

    return { success: true, message: 'File deleted successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Restore deleted file
 */
async function restoreFile(fileId, userId, ipAddress) {
  const result = await query(
    'UPDATE files SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1 AND user_id = $2 AND is_deleted = TRUE RETURNING id, original_name',
    [fileId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('File not found or not deleted');
  }

  const file = result.rows[0];

  await createAuditLog({
    userId,
    action: 'restore',
    resourceType: 'file',
    resourceId: fileId,
    ipAddress,
    metadata: {
      filename: file.original_name,
    },
  });

  return result.rows[0];
}

/**
 * Move file to different folder
 */
async function moveFile(fileId, userId, newFolderId, ipAddress) {
  const result = await query(
    'UPDATE files SET folder_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE RETURNING id, original_name',
    [newFolderId, fileId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('File not found');
  }

  const file = result.rows[0];

  await createAuditLog({
    userId,
    action: 'move',
    resourceType: 'file',
    resourceId: fileId,
    ipAddress,
    metadata: {
      filename: file.original_name,
      newFolderId,
    },
  });

  return result.rows[0];
}

/**
 * Search files
 */
async function searchFiles(userId, searchQuery, options = {}) {
  const {
    mimeType,
    folderId,
    limit = 50,
    offset = 0,
  } = options;

  let whereConditions = ['user_id = $1', 'is_deleted = FALSE'];
  let params = [userId];
  let paramIndex = 2;

  // Add search query
  if (searchQuery) {
    whereConditions.push(`to_tsvector('english', original_name) @@ plainto_tsquery('english', $${paramIndex})`);
    params.push(searchQuery);
    paramIndex++;
  }

  // Add MIME type filter
  if (mimeType) {
    whereConditions.push(`mime_type = $${paramIndex}`);
    params.push(mimeType);
    paramIndex++;
  }

  // Add folder filter
  if (folderId) {
    whereConditions.push(`folder_id = $${paramIndex}`);
    params.push(folderId);
    paramIndex++;
  }

  params.push(limit, offset);

  const result = await query(
    `SELECT id, original_name, mime_type, size, extension,
            folder_id, preview_path, created_at
     FROM files
     WHERE ${whereConditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );

  return result.rows;
}

/**
 * Get storage statistics
 */
async function getStorageStats(userId) {
  const result = await query(
    `SELECT
       COUNT(*) as total_files,
       SUM(size) as total_size,
       COUNT(CASE WHEN is_deleted = TRUE THEN 1 END) as deleted_files,
       SUM(CASE WHEN is_deleted = TRUE THEN size ELSE 0 END) as deleted_size
     FROM files
     WHERE user_id = $1`,
    [userId]
  );

  const stats = result.rows[0];

  // Get user quota
  const userResult = await query(
    'SELECT storage_quota, storage_used FROM users WHERE id = $1',
    [userId]
  );

  const user = userResult.rows[0];

  return {
    totalFiles: parseInt(stats.total_files),
    totalSize: parseInt(stats.total_size) || 0,
    deletedFiles: parseInt(stats.deleted_files),
    deletedSize: parseInt(stats.deleted_size) || 0,
    storageQuota: parseInt(user.storage_quota),
    storageUsed: parseInt(user.storage_used),
    storageAvailable: parseInt(user.storage_quota) - parseInt(user.storage_used),
  };
}

module.exports = {
  uploadFile,
  getFileById,
  listFiles,
  downloadFile,
  deleteFile,
  restoreFile,
  moveFile,
  searchFiles,
  getStorageStats,
};
