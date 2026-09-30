const crypto = require('crypto');

/**
 * Generates a cryptographically secure ephemeral player ID.
 * This ID exists only for the current session — there are no user accounts.
 *
 * @returns {string} UUID v4, e.g. "a8f3c91e-4b2d-47f1-8e3a-d9c2b1f05e7a"
 */
function generatePlayerId() {
  return crypto.randomUUID();
}

module.exports = { generatePlayerId };
