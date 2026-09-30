const roomService = require('./roomService');
const wordService = require('./wordService');
const {
  GAME_STATES,
  MAX_ATTEMPTS,
  RECONNECT_TIMEOUT_MS,
  ROLES,
} = require('../config/constants');
const { sanitizeName, sanitizeWord } = require('../utils/sanitize');
const { generatePlayerId } = require('../utils/playerId');

/* ─── Game lifecycle ─────────────────────────────────────────────── */

/**
 * Create a new game room.
 * Validates host name + secret word, generates IDs, persists the room.
 *
 * @param {{ playerName, secretWord, socketId }} params
 * @returns {{ room, playerId, roomCode }}
 */
async function createGame({ playerName, secretWord, socketId }) {
  // Validate and sanitize inputs
  const name = sanitizeName(playerName);
  if (!name) throw new Error('Player name is required');

  const word = sanitizeWord(secretWord);
  if (!word) throw new Error('Secret word is required');
  if (!wordService.isValidWord(word)) {
    throw new Error('Secret word must be a valid English word of the correct length');
  }

  const playerId = generatePlayerId();
  const roomCode = await roomService.generateUniqueRoomCode();
  const hostPlayer = { playerId, name, socketId };

  const room = await roomService.createRoom({ roomCode, hostPlayer, secretWord: word });

  return { room, playerId, roomCode };
}

/**
 * Guest joins an existing room.
 * Validates name, room existence, and joinability.
 *
 * @param {{ roomCode, playerName, socketId, existingPlayerId? }} params
 * @returns {{ room, playerId }}
 */
async function joinGame({ roomCode, playerName, socketId, existingPlayerId = null }) {
  const name = sanitizeName(playerName);
  if (!name) throw new Error('Player name is required');

  if (!roomService.roomExists(roomCode)) throw new Error('Room not found');

  if (!roomService.isRoomJoinable(roomCode)) {
    const room = roomService.getRoom(roomCode);
    if (room && room.status === GAME_STATES.PLAYER_DISCONNECTED) {
      throw new Error('This game has ended due to a disconnection');
    }
    if (room && room.guest) {
      throw new Error('This game is already full');
    }
    throw new Error('This game has already started');
  }

  const playerId = existingPlayerId || generatePlayerId();
  const guestPlayer = { playerId, name, socketId };
  const room = await roomService.joinRoom(roomCode, guestPlayer);

  return { room, playerId };
}

/**
 * Host starts the game.
 * Verifies host identity, guest presence, and correct room state.
 *
 * @param {{ roomCode, playerId }} params
 * @returns {object} Updated room
 */
async function startGame({ roomCode, playerId }) {
  const room = roomService.getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.host.playerId !== playerId) throw new Error('Only the host can start the game');
  if (!room.guest) throw new Error('Waiting for another player to join');
  if (room.status !== GAME_STATES.READY_TO_START) {
    throw new Error('Game cannot be started in its current state');
  }

  await roomService.updateRoom(roomCode, { status: GAME_STATES.IN_PROGRESS });
  return roomService.getRoom(roomCode);
}

/* ─── Guess processing ───────────────────────────────────────────── */

/**
 * Validate and score a guess from the guest player.
 * The server is authoritative — all validation happens here.
 *
 * @param {{ roomCode, playerId, guess }} params
 * @returns {{
 *   guess: string,
 *   result: string[],
 *   attempt: number,
 *   isWin: boolean,
 *   isGameOver: boolean,
 *   status: string,
 *   secretWord?: string  // Only present when game ends
 * }}
 */
async function processGuess({ roomCode, playerId, guess }) {
  const room = roomService.getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.status !== GAME_STATES.IN_PROGRESS) throw new Error('Game is not currently in progress');
  if (!room.guest || room.guest.playerId !== playerId) {
    throw new Error('Only the guest player can submit guesses');
  }

  const normalizedGuess = sanitizeWord(guess);
  if (!normalizedGuess) throw new Error('Invalid guess submitted');
  if (!wordService.isValidWord(normalizedGuess)) throw new Error('Not a valid word');

  // Server-authoritative scoring
  const result = wordService.scoreGuess(normalizedGuess, room.secretWord);
  const isWin = wordService.isWinningResult(result);
  const newAttempt = room.currentAttempt + 1;
  const isGameOver = !isWin && newAttempt >= MAX_ATTEMPTS;

  const guessEntry = { word: normalizedGuess, result, attempt: newAttempt };

  // Determine new state
  let newStatus = GAME_STATES.IN_PROGRESS;
  let winner = null;
  if (isWin) {
    newStatus = GAME_STATES.GUEST_WON;
    winner = ROLES.GUEST;
  } else if (isGameOver) {
    newStatus = GAME_STATES.GAME_OVER;
  }

  await roomService.updateRoom(roomCode, {
    guesses: [...room.guesses, guessEntry],
    currentAttempt: newAttempt,
    status: newStatus,
    winner,
  });

  return {
    guess: normalizedGuess,
    result,
    attempt: newAttempt,
    isWin,
    isGameOver,
    status: newStatus,
    // Reveal the secret word only when the game ends
    secretWord: isWin || isGameOver ? room.secretWord : undefined,
  };
}

/* ─── Disconnect / Reconnect ─────────────────────────────────────── */

/**
 * Handle a player disconnecting.
 * Starts a grace-period timer; if they don't reconnect in time,
 * marks the game as PLAYER_DISCONNECTED and notifies the remaining player.
 *
 * @param {{ roomCode, playerId, role, io }} params
 */
function handleDisconnect({ roomCode, playerId, role, io }) {
  const room = roomService.getRoom(roomCode);
  if (!room) return;

  const activeStates = [
    GAME_STATES.IN_PROGRESS,
    GAME_STATES.READY_TO_START,
    GAME_STATES.WAITING_FOR_PLAYER,
  ];

  if (!activeStates.includes(room.status)) return;

  const playerName = role === ROLES.GUEST ? room.guest?.name : room.host?.name;

  // Broadcast temporary disconnection notice
  io.to(roomCode).emit('playerDisconnected', {
    role,
    playerName,
    permanent: false,
    message: `${playerName} disconnected. Waiting for them to reconnect...`,
  });

  // Start grace-period timer
  roomService.setReconnectTimer(
    roomCode,
    role,
    async () => {
      const currentRoom = roomService.getRoom(roomCode);
      if (!currentRoom) return;

      // Permanent disconnect — end the game
      await roomService.updateRoom(roomCode, {
        status: GAME_STATES.PLAYER_DISCONNECTED,
      });

      io.to(roomCode).emit('playerLeft', {
        role,
        playerName,
        permanent: true,
        secretWord: currentRoom.secretWord, // Reveal word on permanent disconnect
        message: `${playerName} left the game. Game over.`,
      });
    },
    RECONNECT_TIMEOUT_MS
  );
}

/**
 * Handle a player reconnecting to an existing room.
 * Cancels their disconnect timer and restores their socket to the room.
 *
 * @param {{ roomCode, playerId, socketId, socket }} params
 * @returns {{ room, role }}
 */
async function handleReconnect({ roomCode, playerId, socketId }) {
  const room = roomService.getRoom(roomCode);
  if (!room) throw new Error('Room no longer exists — it may have expired');

  let role = null;

  if (room.host.playerId === playerId) {
    role = ROLES.HOST;
    room.host.socketId = socketId;
  } else if (room.guest && room.guest.playerId === playerId) {
    role = ROLES.GUEST;
    room.guest.socketId = socketId;
  } else {
    throw new Error('Player not found in this room');
  }

  // Cancel disconnect timeout since they reconnected
  roomService.clearReconnectTimer(`${roomCode}:${role}`);

  return { room, role };
}

/* ─── DTO builders ───────────────────────────────────────────────── */

const GAME_OVER_STATES = [
  GAME_STATES.GUEST_WON,
  GAME_STATES.GAME_OVER,
  GAME_STATES.PLAYER_DISCONNECTED,
];

/**
 * Build a safe room state payload for the GUEST.
 * The secretWord is NEVER included.
 *
 * @param {object} room - In-memory room object
 * @returns {object} Safe guest payload
 */
function getRoomStateForGuest(room) {
  return {
    roomCode: room.roomCode,
    status: room.status,
    host: { name: room.host.name },
    guest: room.guest ? { name: room.guest.name } : null,
    guesses: room.guesses,
    currentAttempt: room.currentAttempt,
    winner: room.winner,
    // ⛔ secretWord intentionally omitted
  };
}

/**
 * Build a safe room state payload for the HOST.
 * Reveals secretWord only after the game has ended.
 *
 * @param {object} room - In-memory room object
 * @returns {object} Safe host payload
 */
function getRoomStateForHost(room) {
  const state = getRoomStateForGuest(room);
  if (GAME_OVER_STATES.includes(room.status)) {
    state.secretWord = room.secretWord;
  }
  return state;
}

module.exports = {
  createGame,
  joinGame,
  startGame,
  processGuess,
  handleDisconnect,
  handleReconnect,
  getRoomStateForGuest,
  getRoomStateForHost,
};
