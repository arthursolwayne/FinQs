const { fileTypeFromBuffer } = require('file-type');

// Whitelist of allowed MIME types for dataroom
const ALLOWED_MIME_TYPES = {
  // Documents
  'application/pdf': { ext: '.pdf', category: 'document' },
  'application/msword': { ext: '.doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: '.docx',
    category: 'document'
  },

  // Spreadsheets
  'application/vnd.ms-excel': { ext: '.xls', category: 'spreadsheet' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: '.xlsx',
    category: 'spreadsheet'
  },
  'application/vnd.ms-excel.sheet.macroEnabled.12': {
    ext: '.xlsm',
    category: 'spreadsheet'
  },

  // Presentations
  'application/vnd.ms-powerpoint': { ext: '.ppt', category: 'presentation' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    ext: '.pptx',
    category: 'presentation'
  },

  // Images
  'image/jpeg': { ext: '.jpg', category: 'image' },
  'image/png': { ext: '.png', category: 'image' },
  'image/webp': { ext: '.webp', category: 'image' },
  'image/tiff': { ext: '.tif', category: 'image' },

  // Text
  'text/plain': { ext: '.txt', category: 'text' },
  'text/csv': { ext: '.csv', category: 'text' },
  'application/json': { ext: '.json', category: 'text' },
  'application/xml': { ext: '.xml', category: 'text' },
  'text/xml': { ext: '.xml', category: 'text' },

  // Archives
  'application/zip': { ext: '.zip', category: 'archive' },
  'application/x-rar-compressed': { ext: '.rar', category: 'archive' },
  'application/x-7z-compressed': { ext: '.7z', category: 'archive' },
};

// Magic bytes for common file types (for validation)
const MAGIC_BYTES = {
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF
  'application/zip': Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK (also DOCX, XLSX, PPTX)
};

/**
 * Validate MIME type against file content
 */
async function validateMimeType(fileBuffer, declaredMimeType, filename) {
  // Use file-type library to detect actual MIME type from content
  const detectedType = await fileTypeFromBuffer(fileBuffer);

  // For text files, file-type may not detect anything
  if (!detectedType && isTextFile(filename, declaredMimeType)) {
    return {
      mime: declaredMimeType,
      ext: getExtension(filename),
      category: ALLOWED_MIME_TYPES[declaredMimeType]?.category || 'text',
    };
  }

  if (!detectedType) {
    throw new Error('Unable to determine file type from content');
  }

  // Check if detected type is in whitelist
  if (!ALLOWED_MIME_TYPES[detectedType.mime]) {
    throw new Error(`File type not allowed: ${detectedType.mime}`);
  }

  // For Office documents (ZIP-based), trust declared type if it's in whitelist
  // because they all have the same ZIP magic bytes
  if (detectedType.mime === 'application/zip' && isOfficeDocument(declaredMimeType)) {
    if (ALLOWED_MIME_TYPES[declaredMimeType]) {
      return {
        mime: declaredMimeType,
        ext: ALLOWED_MIME_TYPES[declaredMimeType].ext,
        category: ALLOWED_MIME_TYPES[declaredMimeType].category,
      };
    }
  }

  // Verify declared type matches detected (if provided)
  if (declaredMimeType && declaredMimeType !== detectedType.mime) {
    // Allow some flexibility for JPEG (image/jpeg vs image/jpg)
    if (!(
      (declaredMimeType === 'image/jpeg' && detectedType.mime === 'image/jpg') ||
      (declaredMimeType === 'image/jpg' && detectedType.mime === 'image/jpeg')
    )) {
      throw new Error(
        `Declared MIME type (${declaredMimeType}) does not match detected type (${detectedType.mime})`
      );
    }
  }

  return {
    mime: detectedType.mime,
    ext: detectedType.ext,
    category: ALLOWED_MIME_TYPES[detectedType.mime]?.category || 'unknown',
  };
}

/**
 * Validate magic bytes match MIME type
 */
function validateMagicBytes(fileBuffer, mimeType) {
  const expectedMagic = MAGIC_BYTES[mimeType];

  if (!expectedMagic) {
    // No magic bytes defined, skip validation
    return true;
  }

  const fileMagic = fileBuffer.slice(0, expectedMagic.length);
  return fileMagic.equals(expectedMagic);
}

/**
 * Check if file is a text file based on extension/MIME
 */
function isTextFile(filename, mimeType) {
  const textExtensions = ['.txt', '.csv', '.json', '.xml', '.log', '.md'];
  const ext = getExtension(filename);

  return textExtensions.includes(ext) ||
         (mimeType && mimeType.startsWith('text/'));
}

/**
 * Check if MIME type is an Office document
 */
function isOfficeDocument(mimeType) {
  return mimeType && mimeType.includes('openxmlformats-officedocument');
}

/**
 * Get file extension from filename
 */
function getExtension(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Validate filename extension matches MIME type
 */
function validateExtension(filename, mimeType) {
  const actualExt = getExtension(filename);
  const expectedExt = ALLOWED_MIME_TYPES[mimeType]?.ext;

  if (!expectedExt) {
    return true; // No expected extension defined
  }

  // Allow .jpeg for .jpg and vice versa
  if ((actualExt === '.jpg' || actualExt === '.jpeg') &&
      (expectedExt === '.jpg' || expectedExt === '.jpeg')) {
    return true;
  }

  if (actualExt !== expectedExt) {
    throw new Error(
      `File extension (${actualExt}) does not match MIME type (expected ${expectedExt})`
    );
  }

  return true;
}

/**
 * Check for double extensions (e.g., file.jpg.exe)
 */
function checkDoubleExtension(filename) {
  const path = require('path');
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);
  const doubleExt = path.extname(basename);

  if (doubleExt && doubleExt !== '.') {
    throw new Error('Double extension detected - possible security risk');
  }

  return true;
}

/**
 * Block dangerous extensions
 */
function blockExecutableExtensions(filename) {
  const dangerousExtensions = [
    '.exe', '.dll', '.so', '.dylib', '.sh', '.bat', '.cmd', '.com',
    '.pif', '.scr', '.vbs', '.js', '.jar', '.app', '.deb', '.rpm',
    '.msi', '.apk', '.dmg', '.bin'
  ];

  const ext = getExtension(filename);

  if (dangerousExtensions.includes(ext)) {
    throw new Error('Executable files are not allowed');
  }

  return true;
}

/**
 * Get file category by MIME type
 */
function getFileCategory(mimeType) {
  return ALLOWED_MIME_TYPES[mimeType]?.category || 'unknown';
}

/**
 * Get all allowed MIME types
 */
function getAllowedMimeTypes() {
  return Object.keys(ALLOWED_MIME_TYPES);
}

module.exports = {
  validateMimeType,
  validateMagicBytes,
  validateExtension,
  checkDoubleExtension,
  blockExecutableExtensions,
  getFileCategory,
  getAllowedMimeTypes,
  ALLOWED_MIME_TYPES,
};
