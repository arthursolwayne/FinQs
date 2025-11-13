const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { query } = require('../db/database');

const PREVIEW_DIR = process.env.PREVIEW_DIR || './uploads/previews';

/**
 * Generate preview for a file
 */
async function generatePreview(fileId, filePath, mimeType) {
  try {
    let previewPath = null;

    // Generate preview based on file type
    if (mimeType.startsWith('image/')) {
      previewPath = await generateImagePreview(fileId, filePath);
    }
    // Add more preview types as needed (PDF, video, etc.)

    // Update file record with preview path
    if (previewPath) {
      await query(
        'UPDATE files SET preview_path = $1 WHERE id = $2',
        [previewPath, fileId]
      );
    }

    return previewPath;
  } catch (error) {
    console.error('Error generating preview:', error);
    return null;
  }
}

/**
 * Generate image preview (thumbnail)
 */
async function generateImagePreview(fileId, imagePath) {
  try {
    // Create preview directory if it doesn't exist
    await fs.mkdir(PREVIEW_DIR, { recursive: true });

    const previewFilename = `${fileId}_preview.jpg`;
    const previewPath = path.join(PREVIEW_DIR, previewFilename);

    // Generate thumbnail using sharp
    await sharp(imagePath)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(previewPath);

    return previewPath;
  } catch (error) {
    console.error('Error generating image preview:', error);
    return null;
  }
}

/**
 * Get preview data for file
 */
async function getPreviewData(fileId, userId) {
  const result = await query(
    'SELECT id, mime_type, preview_path, original_name, size FROM files WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
    [fileId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('File not found');
  }

  const file = result.rows[0];

  return {
    id: file.id,
    type: getPreviewType(file.mime_type),
    mimeType: file.mime_type,
    previewPath: file.preview_path,
    previewAvailable: !!file.preview_path,
    originalName: file.original_name,
    size: file.size,
  };
}

/**
 * Determine preview type based on MIME type
 */
function getPreviewType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.includes('spreadsheet')) return 'spreadsheet';
  if (mimeType.includes('document')) return 'document';
  if (mimeType.includes('presentation')) return 'presentation';

  return 'unknown';
}

module.exports = {
  generatePreview,
  generateImagePreview,
  getPreviewData,
  getPreviewType,
};
