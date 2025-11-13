const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user?.role === 'admin';
  },
  keyGenerator: (req) => {
    // Rate limit per user ID if authenticated, otherwise per IP
    return req.user?.id || req.ip;
  },
});

/**
 * Upload rate limiter (stricter)
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 10,
  message: {
    error: 'Too many uploads',
    message: 'Too many file uploads from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.user?.role === 'admin';
  },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Auth rate limiter (for login/register endpoints)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many login attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  uploadLimiter,
  authLimiter,
};
