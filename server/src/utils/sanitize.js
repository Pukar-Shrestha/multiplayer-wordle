const { MAX_NAME_LENGTH } = require('../config/constants');

/**
 * Sanitizes a player display name.
 * - Trims whitespace
 * - Removes HTML special characters to prevent XSS
 * - Enforces maximum length
 *
 * @param {*} name - Raw user input
 * @returns {string} Sanitized name or empty string if invalid
 */
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/[<>&"'`/\\]/g, '') // strip HTML/JS injection chars
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

/**
 * Sanitizes and normalizes a room code.
 * Converts to uppercase and removes any non-alphanumeric characters.
 *
 * @param {*} code - Raw user input
 * @returns {string} Uppercase 5-char alphanumeric code or empty string
 */
function sanitizeRoomCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/**
 * Sanitizes and normalizes a word (secret word or guess).
 * Converts to lowercase and strips non-alphabetic characters.
 *
 * @param {*} word - Raw user input
 * @returns {string} Lowercase alphabetic-only word or empty string
 */
function sanitizeWord(word) {
  if (!word || typeof word !== 'string') return '';
  return word.toLowerCase().trim().replace(/[^a-z]/g, '');
}

/**
 * Validates that a string is a non-empty string within a max length.
 *
 * @param {*} value
 * @param {number} maxLen
 * @returns {boolean}
 */
function isValidString(value, maxLen = 255) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

module.exports = { sanitizeName, sanitizeRoomCode, sanitizeWord, isValidString };
