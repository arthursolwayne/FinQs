const path = require('path');
const crypto = require('crypto');

/**
 * Sanitize filename to prevent security issues
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid filename');
  }

  // Get extension first
  const ext = path.extname(filename);
  let basename = path.basename(filename, ext);

  // Remove path separators
  basename = basename
    .replace(/\//g, '_')
    .replace(/\\/g, '_');

  // Remove control characters
  basename = basename.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove special characters that could cause issues
  basename = basename.replace(/[<>:"|?*~`!@#$%^&()+=\[\]{};',]/g, '_');

  // Remove leading/trailing spaces and dots
  basename = basename.trim().replace(/^\.+|\.+$/g, '');

  // Limit length (filesystem limit is 255, but we keep some room)
  if (basename.length > 200) {
    basename = basename.substring(0, 200);
  }

  // Prevent reserved filenames (Windows)
  const reserved = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5',
    'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5',
    'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  if (reserved.includes(basename.toUpperCase())) {
    basename = `_${basename}`;
  }

  // Ensure we have something left
  if (!basename) {
    basename = 'unnamed_file';
  }

  return basename + ext.toLowerCase();
}

/**
 * Generate secure filename using hash
 */
function generateSecureFilename(originalFilename, contentHash) {
  const ext = path.extname(originalFilename).toLowerCase();

  // Use content hash if provided, otherwise generate random
  const hash = contentHash || crypto.randomBytes(16).toString('hex');

  return `${hash}${ext}`;
}

/**
 * Generate storage path using sharding strategy
 * Format: /uploads/{first2chars}/{next2chars}/{hash}.{ext}
 */
function generateStoragePath(contentHash, extension, baseDir = 'uploads') {
  if (!contentHash || contentHash.length < 4) {
    throw new Error('Content hash too short for sharding');
  }

  const first2 = contentHash.substring(0, 2);
  const next2 = contentHash.substring(2, 4);
  const filename = `${contentHash}${extension.toLowerCase()}`;

  return path.join(baseDir, first2, next2, filename);
}

/**
 * Validate path to prevent traversal attacks
 */
function validatePath(basePath, filePath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(filePath);

  // Ensure resolved path starts with base path
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Path traversal detected');
  }

  // Check for null bytes
  if (filePath.includes('\x00')) {
    throw new Error('Invalid path: contains null bytes');
  }

  // Check for dangerous patterns
  const dangerousPatterns = ['..', '~'];
  if (dangerousPatterns.some(pattern => filePath.includes(pattern))) {
    throw new Error('Invalid path: contains dangerous characters');
  }

  return resolvedPath;
}

/**
 * Calculate SHA-256 hash of file content
 */
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  sanitizeFilename,
  generateSecureFilename,
  generateStoragePath,
  validatePath,
  calculateFileHash,
};
