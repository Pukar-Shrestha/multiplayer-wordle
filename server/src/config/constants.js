/**
 * Global game constants.
 * Change WORD_LENGTH and MAX_ATTEMPTS here to adjust the game rules.
 */

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

/**
 * All possible game states.
 * The server transitions between these; the client reads them but never writes them.
 */
const GAME_STATES = {
  WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',   // Host created room, no guest yet
  PLAYER_JOINED: 'PLAYER_JOINED',             // Guest entered lobby (alias for READY_TO_START)
  READY_TO_START: 'READY_TO_START',           // Both players in lobby, host can start
  IN_PROGRESS: 'IN_PROGRESS',                 // Game running, guest guessing
  GUEST_WON: 'GUEST_WON',                     // Guest guessed correctly
  GAME_OVER: 'GAME_OVER',                     // Guest ran out of attempts
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED', // A player disconnected permanently
};

/** Wordle tile feedback colors */
const TILE_COLORS = {
  GREEN: 'green',   // Correct letter, correct position
  YELLOW: 'yellow', // Correct letter, wrong position
  GRAY: 'gray',     // Letter not in word
};

/** Player roles */
const ROLES = {
  HOST: 'host',   // Word setter, observer
  GUEST: 'guest', // Guesser
};

/**
 * How long (ms) to wait for a disconnected player to reconnect before
 * marking the game as permanently ended.
 */
const RECONNECT_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * How often (ms) the server scans for expired rooms.
 */
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Room code format: 5 uppercase alphanumeric characters.
 */
const ROOM_CODE_REGEX = /^[A-Z0-9]{5}$/;

/**
 * Maximum player name length.
 */
const MAX_NAME_LENGTH = 20;

module.exports = {
  WORD_LENGTH,
  MAX_ATTEMPTS,
  GAME_STATES,
  TILE_COLORS,
  ROLES,
  RECONNECT_TIMEOUT_MS,
  CLEANUP_INTERVAL_MS,
  ROOM_CODE_REGEX,
  MAX_NAME_LENGTH,
};
