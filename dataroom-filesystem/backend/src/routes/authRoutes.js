const express = require('express');
const { register, login, getUserById } = require('../services/authService');
const { requireAuth } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const {
  validateRegistration,
  validateLogin,
} = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await register(email, password);

    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (error) {
    res.status(400).json({
      error: 'Registration failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);

    res.json({
      message: 'Login successful',
      ...result,
    });
  } catch (error) {
    res.status(401).json({
      error: 'Login failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    res.json({
      user,
    });
  } catch (error) {
    res.status(404).json({
      error: 'User not found',
      message: error.message,
    });
  }
});

module.exports = router;
