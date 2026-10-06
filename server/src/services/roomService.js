const { generateRoomCode } = require('../utils/roomCode');
const { GAME_STATES, RECONNECT_TIMEOUT_MS } = require('../config/constants');
const Game = require('../models/Game');

/* ─── In-memory store ────────────────────────────────────────────── */
// Primary store for low-latency lookups during active gameplay.
// MongoDB is the source of truth for persistence and reconnection recovery.
const rooms = new Map();

/* ─── Reconnection timers ────────────────────────────────────────── */
// key: `${roomCode}:${role}` → NodeJS Timeout handle
const reconnectTimers = new Map();

/* ─── Room CRUD ──────────────────────────────────────────────────── */

/**
 * Create a new game room in memory and persist to MongoDB.
 *
 * @param {object} params
 * @param {string} params.roomCode
 * @param {{ playerId, name, socketId }} params.hostPlayer
 * @param {string} params.secretWord - Already validated and normalized
 * @returns {object} The in-memory room object
 */
async function createRoom({ roomCode, hostPlayer, secretWord, maxGuests = 5, timerMinutes = 5 }) {
  const roomData = {
    roomCode,
    status: GAME_STATES.WAITING_FOR_PLAYER,
    settings: { maxGuests, timerMinutes },
    host: { ...hostPlayer },
    guests: [],
    secretWord,
    winner: null,
    createdAt: Date.now(),
  };

  // Persist to MongoDB
  const game = new Game({
    roomCode,
    status: GAME_STATES.WAITING_FOR_PLAYER,
    settings: { maxGuests, timerMinutes },
    host: {
      playerId: hostPlayer.playerId,
      name: hostPlayer.name,
      socketId: hostPlayer.socketId,
    },
    secretWord,
    guests: [],
    winner: null,
  });
  await game.save();

  rooms.set(roomCode, roomData);
  return roomData;
}

/**
 * Retrieve a room from the in-memory store.
 * Returns null if not found.
 *
 * @param {string} roomCode
 * @returns {object|null}
 */
function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

/**
 * Add a guest player to an existing room.
 *
 * @param {string} roomCode
 * @param {{ playerId, name, socketId }} guestPlayer
 * @returns {object} Updated room
 */
async function joinRoom(roomCode, guestPlayer) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.status !== GAME_STATES.WAITING_FOR_PLAYER && room.status !== GAME_STATES.READY_TO_START) throw new Error('Room is not joinable');
  if (room.guests.length >= room.settings.maxGuests) throw new Error('Room is full');

  // Check if player is already in the room
  if (room.guests.find((g) => g.playerId === guestPlayer.playerId)) {
    return room;
  }

  const newGuest = {
    playerId: guestPlayer.playerId,
    name: guestPlayer.name,
    socketId: guestPlayer.socketId,
    guesses: [],
    currentAttempt: 0,
    hasWon: false,
  };

  room.guests.push(newGuest);
  
  if (room.guests.length > 0) {
    room.status = GAME_STATES.READY_TO_START;
  }

  // Sync to MongoDB
  await Game.findOneAndUpdate(
    { roomCode },
    {
      $push: { guests: newGuest },
      $set: { status: room.status },
    },
    { new: true }
  );

  return room;
}

/**
 * Apply a partial update to a room (memory + MongoDB).
 * Never pass secretWord in updates sent to the client — use DTO methods.
 *
 * @param {string} roomCode
 * @param {object} updates - Fields to merge into the room
 * @returns {object|null} Updated room
 */
async function updateRoom(roomCode, updates) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  Object.assign(room, updates);

  await Game.findOneAndUpdate({ roomCode }, { $set: updates }, { new: true });

  return room;
}

/**
 * Delete a room from memory and MongoDB.
 *
 * @param {string} roomCode
 */
async function deleteRoom(roomCode) {
  rooms.delete(roomCode);
  await Game.deleteOne({ roomCode });
}

/* ─── Room queries ───────────────────────────────────────────────── */

function roomExists(roomCode) {
  return rooms.has(roomCode);
}

/**
 * A room is joinable if it exists, has space, and is waiting/ready.
 */
function isRoomJoinable(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return false;
  return (
    (room.status === GAME_STATES.WAITING_FOR_PLAYER || room.status === GAME_STATES.READY_TO_START) &&
    room.guests.length < room.settings.maxGuests
  );
}

/* ─── Reconnection timers ────────────────────────────────────────── */

/**
 * Start a reconnection grace-period timer.
 * If the player does not reconnect within the timeout, `callback` is called.
 *
 * @param {string} roomCode
 * @param {string} role - 'host' | 'guest'
 * @param {Function} callback - Called when timeout expires
 * @param {number} [timeoutMs]
 * @returns {string} Timer key
 */
function setReconnectTimer(roomCode, role, callback, timeoutMs = RECONNECT_TIMEOUT_MS) {
  const key = `${roomCode}:${role}`;
  clearReconnectTimer(key); // Clear any existing timer for same slot
  const handle = setTimeout(callback, timeoutMs);
  reconnectTimers.set(key, handle);
  return key;
}

/**
 * Cancel a reconnect timer (player reconnected successfully).
 *
 * @param {string} key - Value returned by setReconnectTimer
 */
function clearReconnectTimer(key) {
  if (reconnectTimers.has(key)) {
    clearTimeout(reconnectTimers.get(key));
    reconnectTimers.delete(key);
  }
}

/* ─── Room expiration / cleanup ──────────────────────────────────── */

/**
 * Remove rooms from memory and MongoDB that are older than expirationMs.
 * Called on a periodic interval by the server.
 *
 * @param {number} expirationMs
 */
async function cleanupExpiredRooms(expirationMs) {
  const now = Date.now();
  const expiredCodes = [];

  for (const [code, room] of rooms) {
    if (now - room.createdAt > expirationMs) {
      expiredCodes.push(code);
    }
  }

  for (const code of expiredCodes) {
    rooms.delete(code);
  }

  if (expiredCodes.length > 0) {
    await Game.deleteMany({ roomCode: { $in: expiredCodes } });
    console.log(`🧹 Cleaned up ${expiredCodes.length} expired room(s): ${expiredCodes.join(', ')}`);
  }
}

/* ─── Room code generation ───────────────────────────────────────── */

/**
 * Generate a room code that doesn't collide with any existing in-memory or
 * persisted room. Retries up to maxAttempts times.
 *
 * @param {number} [maxAttempts=10]
 * @returns {Promise<string>}
 */
async function generateUniqueRoomCode(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRoomCode();
    if (rooms.has(code)) continue;

    // Double-check the database in case the server restarted
    const existing = await Game.findOne({ roomCode: code });
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique room code after multiple attempts');
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  joinRoom,
  updateRoom,
  deleteRoom,
  roomExists,
  isRoomJoinable,
  setReconnectTimer,
  clearReconnectTimer,
  cleanupExpiredRooms,
  generateUniqueRoomCode,
};
