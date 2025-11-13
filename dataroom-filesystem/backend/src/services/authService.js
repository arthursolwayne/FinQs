const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db/database');

const SALT_ROUNDS = 10;

/**
 * Register a new user
 */
async function register(email, password, role = 'user') {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    throw new Error('User already exists with this email');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user
  const result = await query(
    `INSERT INTO users (email, password_hash, role, storage_quota, storage_used)
     VALUES ($1, $2, $3, $4, 0)
     RETURNING id, email, role, storage_quota, storage_used, created_at`,
    [
      email.toLowerCase(),
      passwordHash,
      role,
      parseInt(process.env.DEFAULT_STORAGE_QUOTA) || 5368709120
    ]
  );

  return result.rows[0];
}

/**
 * Login user
 */
async function login(email, password) {
  // Find user
  const result = await query(
    'SELECT id, email, password_hash, role, storage_quota, storage_used FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // Generate JWT token
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  // Return user data without password hash
  delete user.password_hash;

  return {
    user,
    token
  };
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const result = await query(
    'SELECT id, email, role, storage_quota, storage_used, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return result.rows[0];
}

/**
 * Update user storage usage
 */
async function updateStorageUsage(userId, bytesChange) {
  const result = await query(
    'UPDATE users SET storage_used = storage_used + $1 WHERE id = $2 RETURNING storage_used, storage_quota',
    [bytesChange, userId]
  );

  return result.rows[0];
}

/**
 * Check if user has storage available
 */
async function checkStorageQuota(userId, requiredBytes) {
  const result = await query(
    'SELECT storage_quota, storage_used FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const { storage_quota, storage_used } = result.rows[0];
  const available = storage_quota - storage_used;

  if (requiredBytes > available) {
    throw new Error(
      `Storage quota exceeded. Available: ${(available / 1024 / 1024).toFixed(2)}MB, ` +
      `Required: ${(requiredBytes / 1024 / 1024).toFixed(2)}MB`
    );
  }

  return true;
}

module.exports = {
  register,
  login,
  verifyToken,
  getUserById,
  updateStorageUsage,
  checkStorageQuota,
};
