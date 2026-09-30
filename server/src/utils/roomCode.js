const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars: 0/O, 1/I

/**
 * Generates a cryptographically random room code.
 * Uses crypto.randomBytes to avoid Math.random() bias.
 *
 * @param {number} length - Length of the code (default 5)
 * @returns {string} Uppercase alphanumeric code, e.g. "K7P9X"
 */
function generateRoomCode(length = 5) {
  let code = '';
  // Generate more bytes than needed to account for modulo bias mitigation
  const bytes = crypto.randomBytes(length * 2);
  let byteIndex = 0;

  while (code.length < length) {
    const byte = bytes[byteIndex++];
    // Discard bytes that would cause modulo bias
    if (byte < Math.floor(256 / CHARS.length) * CHARS.length) {
      code += CHARS[byte % CHARS.length];
    }
  }

  return code;
}

module.exports = { generateRoomCode };
