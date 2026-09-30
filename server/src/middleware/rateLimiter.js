const rateLimit = require('express-rate-limit');

/**
 * General REST API rate limiter.
 * Prevents abuse of HTTP endpoints (room existence checks, health).
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/**
 * Per-socket guess rate limiter (used inside Socket.IO handler).
 * Tracks guess timestamps per socketId to enforce a cooldown.
 *
 * Returns true if the guess is allowed, false if rate-limited.
 *
 * @param {Map<string, number[]>} store   - Shared map: socketId → timestamp[]
 * @param {string}                socketId
 * @param {number}                windowMs - Time window in ms
 * @param {number}                maxGuesses - Max guesses per window
 * @returns {boolean} true = allowed, false = rate-limited
 */
function checkGuessRateLimit(store, socketId, windowMs, maxGuesses) {
  const now = Date.now();
  const timestamps = store.get(socketId) || [];

  // Remove timestamps outside the current window
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxGuesses) {
    return false; // rate-limited
  }

  recent.push(now);
  store.set(socketId, recent);
  return true;
}

module.exports = { apiLimiter, checkGuessRateLimit };
