const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { query } = require('../db/database');
const { getStorage } = require('../storage');

const PREVIEW_DIR = process.env.PREVIEW_DIR || './uploads/previews';

/**
 * Generate preview for a file
 */
async function generatePreview(fileId, filePath, mimeType, storageType = 'local') {
  try {
    let previewPath = null;

    // Generate preview based on file type
    if (mimeType.startsWith('image/')) {
      previewPath = await generateImagePreview(fileId, filePath, storageType);
    } else if (mimeType === 'application/pdf') {
      previewPath = await generatePdfPreview(fileId, filePath, storageType);
    } else if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') {
      previewPath = await generateDocxPreview(fileId, filePath, storageType);
    } else if (mimeType === 'application/zip' || mimeType === 'application/x-rar-compressed') {
      // For archives, generate metadata instead of preview image
      previewPath = await generateArchiveMetadata(fileId, filePath, storageType);
    }

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
async function generateImagePreview(fileId, imagePath, storageType = 'local') {
  try {
    // Create preview directory if it doesn't exist
    await fs.mkdir(PREVIEW_DIR, { recursive: true });

    const previewFilename = `${fileId}_preview.jpg`;
    const previewPath = path.join(PREVIEW_DIR, previewFilename);

    let imageBuffer;

    if (storageType === 's3') {
      // For S3, retrieve the file first
      const storage = getStorage();
      imageBuffer = await storage.retrieve(imagePath);
    } else {
      // For local, read directly
      imageBuffer = await fs.readFile(imagePath);
    }

    // Generate thumbnail using sharp
    await sharp(imageBuffer)
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
 * Generate PDF preview (text extraction + metadata)
 */
async function generatePdfPreview(fileId, pdfPath, storageType = 'local') {
  try {
    const pdfParse = require('pdf-parse');

    // Get PDF buffer (works with both local and S3)
    let pdfBuffer;
    if (storageType === 's3') {
      const storage = getStorage();
      pdfBuffer = await storage.retrieve(pdfPath);
    } else {
      pdfBuffer = await fs.readFile(pdfPath);
    }

    // Parse PDF to extract text and metadata
    const data = await pdfParse(pdfBuffer);

    const previewFilename = `${fileId}-preview.html`;
    const previewPath = path.join(PREVIEW_DIR, previewFilename);

    await fs.mkdir(PREVIEW_DIR, { recursive: true });

    // Create HTML preview with extracted text
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PDF Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 30px;
      max-width: 900px;
      margin: 0 auto;
      background-color: #f5f5f5;
      color: #333;
    }
    .metadata {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metadata h2 {
      margin-top: 0;
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    .metadata-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin-top: 15px;
    }
    .metadata-label {
      font-weight: 600;
      color: #555;
    }
    .metadata-value {
      color: #333;
    }
    .content {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      line-height: 1.8;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .content h2 {
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
      margin-top: 0;
    }
  </style>
</head>
<body>
  <div class="metadata">
    <h2>📄 PDF Document Information</h2>
    <div class="metadata-grid">
      <div class="metadata-label">Pages:</div>
      <div class="metadata-value">${data.numpages}</div>
      <div class="metadata-label">Title:</div>
      <div class="metadata-value">${data.info?.Title || 'N/A'}</div>
      <div class="metadata-label">Author:</div>
      <div class="metadata-value">${data.info?.Author || 'N/A'}</div>
      <div class="metadata-label">Subject:</div>
      <div class="metadata-value">${data.info?.Subject || 'N/A'}</div>
      <div class="metadata-label">Creator:</div>
      <div class="metadata-value">${data.info?.Creator || 'N/A'}</div>
      <div class="metadata-label">Creation Date:</div>
      <div class="metadata-value">${data.info?.CreationDate || 'N/A'}</div>
    </div>
  </div>
  <div class="content">
    <h2>📝 Extracted Text Content</h2>
    ${escapeHtml(data.text)}
  </div>
</body>
</html>`;

    await fs.writeFile(previewPath, fullHtml);

    console.log(`✓ PDF preview generated: ${previewFilename} (${data.numpages} pages, ${data.text.length} chars)`);
    return previewPath;
  } catch (error) {
    console.error('Error generating PDF preview:', error);
    return null;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate DOCX preview (convert to HTML)
 */
async function generateDocxPreview(fileId, docxPath, storageType = 'local') {
  try {
    const mammoth = require('mammoth');

    await fs.mkdir(PREVIEW_DIR, { recursive: true });

    let result;

    if (storageType === 's3') {
      const storage = getStorage();
      const buffer = await storage.retrieve(docxPath);
      result = await mammoth.convertToHtml({ buffer });
    } else {
      result = await mammoth.convertToHtml({ path: docxPath });
    }

    const previewFilename = `${fileId}_docx_preview.html`;
    const previewPath = path.join(PREVIEW_DIR, previewFilename);

    // Wrap in full HTML document
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 8px; }
  </style>
</head>
<body>
  ${result.value}
</body>
</html>`;

    await fs.writeFile(previewPath, fullHtml);

    return previewPath;
  } catch (error) {
    console.error('Error generating DOCX preview:', error);
    return null;
  }
}

/**
 * Generate archive metadata (ZIP/RAR listing)
 */
async function generateArchiveMetadata(fileId, archivePath, storageType = 'local') {
  try {
    const yauzl = require('yauzl');

    await fs.mkdir(PREVIEW_DIR, { recursive: true });

    let localPath = archivePath;

    // If S3, download to temp file first
    if (storageType === 's3') {
      const os = require('os');
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-'));
      localPath = path.join(tempDir, 'archive.zip');

      const storage = getStorage();
      const buffer = await storage.retrieve(archivePath);
      await fs.writeFile(localPath, buffer);
    }

    // List ZIP contents
    const entries = await listZipContents(localPath);

    const previewFilename = `${fileId}_archive_metadata.json`;
    const previewPath = path.join(PREVIEW_DIR, previewFilename);

    const metadata = {
      type: 'archive',
      fileCount: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
      files: entries.slice(0, 100), // Limit to first 100 files
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(previewPath, JSON.stringify(metadata, null, 2));

    // Cleanup temp file if S3
    if (storageType === 's3') {
      const tempDir = path.dirname(localPath);
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    return previewPath;
  } catch (error) {
    console.error('Error generating archive metadata:', error);
    return null;
  }
}

/**
 * List ZIP contents securely using yauzl
 */
function listZipContents(zipPath) {
  return new Promise((resolve, reject) => {
    const yauzl = require('yauzl');
    const entries = [];

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        const info = {
          filename: entry.fileName,
          size: entry.uncompressedSize,
          compressedSize: entry.compressedSize,
          compressionRatio: entry.uncompressedSize / entry.compressedSize,
          isDirectory: /\/$/.test(entry.fileName),
        };

        // Zip bomb detection
        if (info.compressionRatio > 100) {
          console.warn(`Suspicious compression ratio: ${info.filename} (${info.compressionRatio.toFixed(2)}:1)`);
        }

        entries.push(info);
        zipfile.readEntry();
      });

      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
    });
  });
}

/**
 * Extract specific file from ZIP
 */
async function extractFileFromZip(zipPath, targetFilename, outputPath) {
  return new Promise((resolve, reject) => {
    const yauzl = require('yauzl');

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (entry.fileName === targetFilename) {
          // Size check to prevent zip bombs
          const MAX_SIZE = 100 * 1024 * 1024; // 100MB
          if (entry.uncompressedSize > MAX_SIZE) {
            return reject(new Error(`File too large: ${entry.uncompressedSize} bytes`));
          }

          zipfile.openReadStream(entry, async (err, readStream) => {
            if (err) return reject(err);

            const writeStream = require('fs').createWriteStream(outputPath);
            readStream.pipe(writeStream);

            writeStream.on('finish', () => {
              zipfile.close();
              resolve(outputPath);
            });

            writeStream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => reject(new Error('File not found in ZIP')));
      zipfile.on('error', reject);
    });
  });
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
  if (mimeType === 'application/zip' || mimeType.includes('compressed')) return 'archive';

  return 'unknown';
}

module.exports = {
  generatePreview,
  generateImagePreview,
  generatePdfPreview,
  generateDocxPreview,
  generateArchiveMetadata,
  listZipContents,
  extractFileFromZip,
  getPreviewData,
  getPreviewType,
};
