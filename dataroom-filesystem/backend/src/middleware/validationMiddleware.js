const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  next();
}

/**
 * Validation rules for user registration
 */
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  handleValidationErrors,
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors,
];

/**
 * Validation rules for file upload
 */
const validateFileUpload = [
  body('folderId')
    .optional()
    .isUUID()
    .withMessage('Folder ID must be a valid UUID'),
  handleValidationErrors,
];

/**
 * Validation rules for folder creation
 */
const validateFolderCreate = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Folder name must be between 1 and 255 characters'),
  body('parentId')
    .optional()
    .isUUID()
    .withMessage('Parent ID must be a valid UUID'),
  handleValidationErrors,
];

/**
 * Validation rules for folder rename
 */
const validateFolderRename = [
  param('id')
    .isUUID()
    .withMessage('Folder ID must be a valid UUID'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Folder name must be between 1 and 255 characters'),
  handleValidationErrors,
];

/**
 * Validation rules for UUID parameters
 */
const validateUUID = [
  param('id')
    .isUUID()
    .withMessage('ID must be a valid UUID'),
  handleValidationErrors,
];

/**
 * Validation rules for search
 */
const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Search query must be between 1 and 500 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateRegistration,
  validateLogin,
  validateFileUpload,
  validateFolderCreate,
  validateFolderRename,
  validateUUID,
  validateSearch,
};
