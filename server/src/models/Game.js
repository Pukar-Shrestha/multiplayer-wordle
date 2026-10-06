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

const guestStateSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 20 },
    socketId: { type: String, default: null },
    guesses: { type: [guessSchema], default: [] },
    currentAttempt: { type: Number, default: 0 },
    hasWon: { type: Boolean, default: false },
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
    settings: {
      maxPlayers: { type: Number, default: 5 }, // 1 to 5 guests
      timerMinutes: { type: Number, default: 5 }, // 1 to 5 minutes
    },
    host: { type: playerSchema, required: true },
    guests: { type: [guestStateSchema], default: [] },
    
    /**
     * SECURITY: secretWord uses `select: false` so it is NEVER returned
     * in a standard Mongoose query unless explicitly requested with `.select('+secretWord')`.
     */
    secretWord: {
      type: String,
      required: true,
      lowercase: true,
      select: false,
    },
    
    winner: {
      type: String, // playerId of winner, or null if no winner, or 'host' if time up
      default: null,
    },
    startedAt: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* ─── Indexes ─────────────────────────────────────────────────────── */

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
    settings: this.settings,
    host: { name: this.host.name },
    guests: this.guests.map(g => ({
      playerId: g.playerId,
      name: g.name,
      guesses: g.guesses,
      currentAttempt: g.currentAttempt,
      hasWon: g.hasWon
    })),
    winner: this.winner,
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
