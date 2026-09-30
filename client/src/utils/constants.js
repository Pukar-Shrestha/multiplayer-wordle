// ── Game rules ────────────────────────────────────────────────────────────
export const WORD_LENGTH  = 5;
export const MAX_ATTEMPTS = 6;

// ── Tile states ───────────────────────────────────────────────────────────
export const TILE_STATES = {
  EMPTY:   'empty',    // No letter yet
  FILLED:  'filled',   // Letter typed but not submitted
  CORRECT: 'correct',  // Green — right letter, right position
  PRESENT: 'present',  // Yellow — right letter, wrong position
  ABSENT:  'absent',   // Gray — letter not in word
};

// Map server result strings → tile states
export const RESULT_TO_STATE = {
  green:  TILE_STATES.CORRECT,
  yellow: TILE_STATES.PRESENT,
  gray:   TILE_STATES.ABSENT,
};

// ── Game states (must match server constants) ─────────────────────────────
export const GAME_STATES = {
  WAITING_FOR_PLAYER:  'WAITING_FOR_PLAYER',
  PLAYER_JOINED:       'PLAYER_JOINED',
  READY_TO_START:      'READY_TO_START',
  IN_PROGRESS:         'IN_PROGRESS',
  GUEST_WON:           'GUEST_WON',
  GAME_OVER:           'GAME_OVER',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
};

// ── Player roles ──────────────────────────────────────────────────────────
export const ROLES = {
  HOST:  'host',
  GUEST: 'guest',
};

// ── Connection status ─────────────────────────────────────────────────────
export const CONNECTION_STATUS = {
  CONNECTED:    'connected',
  CONNECTING:   'connecting',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
};

// ── Wordle tile colours (CSS values) ─────────────────────────────────────
export const TILE_COLORS = {
  correct: '#538d4e',   // green
  present: '#f5793a',   // orange
  absent:  '#3a3a3c',   // gray
  empty:   '#121213',   // dark background
  filled:  '#121213',   // same, but with visible border
};

// ── On-screen keyboard layout ─────────────────────────────────────────────
export const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];
