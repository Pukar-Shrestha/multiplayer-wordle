const path = require('path');
const { WORD_LENGTH, TILE_COLORS } = require('../config/constants');

/* ─── Load word list ─────────────────────────────────────────────── */

// Load into a Set for O(1) validation lookups.
// Filter to exact WORD_LENGTH in case the word list has any stray entries.
const rawWords = require(path.join(__dirname, '../../data/words.json'));
const wordSet = new Set(rawWords.filter((w) => w.length === WORD_LENGTH));

console.log(`📖 Word list loaded: ${wordSet.size} valid ${WORD_LENGTH}-letter words`);

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Check whether a word exists in the valid word list.
 * The word is normalized to lowercase before checking.
 *
 * @param {string} word
 * @returns {boolean}
 */
function isValidWord(word) {
  if (!word || typeof word !== 'string') return false;
  const normalized = word.toLowerCase().trim();
  if (normalized.length !== WORD_LENGTH) return false;
  if (!/^[a-z]+$/.test(normalized)) return false;
  return wordSet.has(normalized);
}

/**
 * Score a guess against the secret word using the official two-pass Wordle algorithm.
 *
 * Two-pass approach correctly handles duplicate letters:
 *  - Pass 1: Mark all exact matches (green). Build a frequency map of remaining secret letters.
 *  - Pass 2: Mark present-but-misplaced letters (yellow) using the frequency map to
 *            prevent over-counting. Remaining positions stay gray.
 *
 * Examples:
 *   scoreGuess('aabbb', 'xaaxx') → ['yellow','green','gray','gray','gray']
 *   scoreGuess('speed', 'abcde') → ['gray','gray','gray','gray','green']
 *
 * @param {string} guess  - Player's guess (lowercase, WORD_LENGTH chars)
 * @param {string} secret - The secret word (lowercase, WORD_LENGTH chars)
 * @returns {Array<'green'|'yellow'|'gray'>} Feedback array, one entry per letter
 */
function scoreGuess(guess, secret) {
  if (guess.length !== WORD_LENGTH || secret.length !== WORD_LENGTH) {
    throw new Error(`Both guess and secret must be ${WORD_LENGTH} characters`);
  }

  const result = Array(WORD_LENGTH).fill(TILE_COLORS.GRAY);
  const secretRemaining = {}; // frequency map for unmatched secret letters

  // ── Pass 1: Exact matches (green) ──────────────────────────────
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      result[i] = TILE_COLORS.GREEN;
    } else {
      // Track remaining (unmatched) letters in secret for pass 2
      secretRemaining[secret[i]] = (secretRemaining[secret[i]] || 0) + 1;
    }
  }

  // ── Pass 2: Present but misplaced (yellow) ──────────────────────
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] !== TILE_COLORS.GREEN && secretRemaining[guess[i]] > 0) {
      result[i] = TILE_COLORS.YELLOW;
      secretRemaining[guess[i]]--; // consume one occurrence to prevent over-counting
    }
    // else: stays GRAY
  }

  return result;
}

/**
 * Checks whether a guess result represents a winning guess (all green).
 *
 * @param {string[]} result - Output of scoreGuess()
 * @returns {boolean}
 */
function isWinningResult(result) {
  return result.every((r) => r === TILE_COLORS.GREEN);
}

/**
 * Returns a random valid word from the word list.
 *
 * @returns {string}
 */
function getRandomWord() {
  const wordsArray = Array.from(wordSet);
  const randomIndex = Math.floor(Math.random() * wordsArray.length);
  return wordsArray[randomIndex];
}

module.exports = { isValidWord, scoreGuess, isWinningResult, getRandomWord, wordSet };
