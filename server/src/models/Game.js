const mongoose = require('mongoose');
const { GAME_STATES } = require('../config/constants');

/* ─── Sub-schemas ─────────────────────────────────────────────────── */

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 20 },
    socketId: { type: String, default: null },
  },
  { _id: false }
);

const guessSchema = new mongoose.Schema(
  {
    word: { type: String, required: true, lowercase: true },
    result: {
      type: [{ type: String, enum: ['green', 'yellow', 'gray'] }],
      required: true,
    },
    attempt: { type: Number, required: true },
  },
  { _id: false }
);

/* ─── Main schema ─────────────────────────────────────────────────── */

const gameSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      match: /^[A-Z0-9]{5}$/,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(GAME_STATES),
      default: GAME_STATES.WAITING_FOR_PLAYER,
      required: true,
    },
    host: { type: playerSchema, required: true },
    guest: { type: playerSchema, default: null },

    /**
     * SECURITY: secretWord uses `select: false` so it is NEVER returned
     * in a standard Mongoose query unless explicitly requested with `.select('+secretWord')`.
     * Always use toGuestDTO() / toHostDTO() to build socket payloads.
     */
    secretWord: {
      type: String,
      required: true,
      lowercase: true,
      select: false,
    },

    guesses: { type: [guessSchema], default: [] },
    currentAttempt: { type: Number, default: 0 },
    winner: {
      type: String,
      enum: ['host', 'guest', null],
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

/* ─── Indexes ─────────────────────────────────────────────────────── */

// TTL index: MongoDB automatically removes documents after ROOM_EXPIRATION_MINUTES.
// The application-level cleanup in roomService runs first; this is a safety net.
// Default: 3600 seconds (1 hour). Adjust via ROOM_EXPIRATION_MINUTES env var at startup.
gameSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: parseInt(process.env.ROOM_EXPIRATION_MINUTES || '60', 10) * 60 }
);

/* ─── Instance methods (DTOs) ─────────────────────────────────────── */

/**
 * Safe payload for the GUEST player.
 * The secretWord is NEVER included regardless of game state.
 */
gameSchema.methods.toGuestDTO = function () {
  return {
    roomCode: this.roomCode,
    status: this.status,
    host: { name: this.host.name },
    guest: this.guest ? { name: this.guest.name } : null,
    guesses: this.guesses,
    currentAttempt: this.currentAttempt,
    winner: this.winner,
    // ⛔ secretWord is intentionally omitted
  };
};

/**
 * Safe payload for the HOST player.
 * Reveals secretWord only after the game has ended.
 */
gameSchema.methods.toHostDTO = function () {
  const dto = this.toGuestDTO();
  const isOver = [
    GAME_STATES.GUEST_WON,
    GAME_STATES.GAME_OVER,
    GAME_STATES.PLAYER_DISCONNECTED,
  ].includes(this.status);

  if (isOver && this.secretWord) {
    dto.secretWord = this.secretWord;
  }
  return dto;
};

module.exports = mongoose.model('Game', gameSchema);
