const express = require('express');
const { health, roomExists } = require('../controllers/gameController');
const { apiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Apply general rate limiting to all API routes
router.use(apiLimiter);

/**
 * GET /api/health
 * Server liveness probe.
 */
router.get('/health', health);

/**
 * GET /api/room/:code/exists
 * Pre-flight check before a guest attempts to join via Socket.IO.
 * Returns room status without exposing the secret word.
 */
router.get('/room/:code/exists', roomExists);

module.exports = router;
