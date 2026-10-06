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
async function createGame({ playerName, secretWord, socketId, maxGuests = 5, timerMinutes = 5 }) {
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

  const room = await roomService.createRoom({ roomCode, hostPlayer, secretWord: word, maxGuests, timerMinutes });

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
    if (room && room.guests.length >= room.settings.maxGuests) {
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
  if (room.guests.length === 0) throw new Error('Waiting for at least one player to join');
  if (room.status !== GAME_STATES.READY_TO_START) {
    throw new Error('Game cannot be started in its current state');
  }

  const now = Date.now();
  await roomService.updateRoom(roomCode, { status: GAME_STATES.IN_PROGRESS, startedAt: now });
  return roomService.getRoom(roomCode);
}

/* ─── Guess processing ───────────────────────────────────────────── */

async function processGuess({ roomCode, playerId, guess }) {
  const room = roomService.getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.status !== GAME_STATES.IN_PROGRESS) throw new Error('Game is not currently in progress');
  
  const guestIndex = room.guests.findIndex(g => g.playerId === playerId);
  if (guestIndex === -1) {
    throw new Error('Only a valid guest player can submit guesses');
  }
  
  const guest = room.guests[guestIndex];
  if (guest.hasWon || guest.currentAttempt >= MAX_ATTEMPTS) {
    throw new Error('This player cannot submit more guesses');
  }

  const normalizedGuess = sanitizeWord(guess);
  if (!normalizedGuess) throw new Error('Invalid guess submitted');
  if (!wordService.isValidWord(normalizedGuess)) throw new Error('Not a valid word');

  // Server-authoritative scoring
  const result = wordService.scoreGuess(normalizedGuess, room.secretWord);
  const isWin = wordService.isWinningResult(result);
  const newAttempt = guest.currentAttempt + 1;
  const isPlayerGameOver = !isWin && newAttempt >= MAX_ATTEMPTS;

  const guessEntry = { word: normalizedGuess, result, attempt: newAttempt };

  // Update guest state
  const updatedGuests = [...room.guests];
  updatedGuests[guestIndex] = {
    ...guest,
    guesses: [...guest.guesses, guessEntry],
    currentAttempt: newAttempt,
    hasWon: isWin
  };

  // Check overall game status
  let newStatus = GAME_STATES.IN_PROGRESS;
  let winner = null;
  
  if (isWin) {
    newStatus = GAME_STATES.GUEST_WON;
    winner = playerId; // Winner is the first player who guessed correctly
  } else {
    // Check if everyone is out of attempts
    const allFinished = updatedGuests.every(g => g.hasWon || g.currentAttempt >= MAX_ATTEMPTS);
    if (allFinished) {
      newStatus = GAME_STATES.GAME_OVER;
    }
  }

  await roomService.updateRoom(roomCode, {
    guests: updatedGuests,
    status: newStatus,
    winner: winner || room.winner,
  });

  return {
    guess: normalizedGuess,
    result,
    attempt: newAttempt,
    isWin,
    isGameOver: newStatus === GAME_STATES.GAME_OVER,
    status: newStatus,
    winner,
    guestName: guest.name,
    // Reveal the secret word only when the game ends
    secretWord: isWin || newStatus === GAME_STATES.GAME_OVER ? room.secretWord : undefined,
  };
}

/* ─── Disconnect / Reconnect ─────────────────────────────────────── */

function handleDisconnect({ roomCode, playerId, role, io }) {
  const room = roomService.getRoom(roomCode);
  if (!room) return;

  const activeStates = [
    GAME_STATES.IN_PROGRESS,
    GAME_STATES.READY_TO_START,
    GAME_STATES.WAITING_FOR_PLAYER,
  ];

  if (!activeStates.includes(room.status)) return;

  let playerName;
  if (role === ROLES.HOST) {
    playerName = room.host.name;
  } else {
    const guest = room.guests.find(g => g.playerId === playerId);
    if (!guest) return;
    playerName = guest.name;
  }

  // Broadcast temporary disconnection notice
  io.to(roomCode).emit('playerDisconnected', {
    role,
    playerId,
    playerName,
    permanent: false,
    message: `${playerName} disconnected. Waiting for them to reconnect...`,
  });

  // Start grace-period timer
  roomService.setReconnectTimer(
    roomCode,
    role === ROLES.HOST ? 'host' : `guest:${playerId}`,
    async () => {
      const currentRoom = roomService.getRoom(roomCode);
      if (!currentRoom) return;

      if (role === ROLES.HOST) {
        // If host leaves, end game completely
        await roomService.updateRoom(roomCode, {
          status: GAME_STATES.PLAYER_DISCONNECTED,
        });
        io.to(roomCode).emit('playerLeft', {
          role,
          playerId,
          playerName,
          permanent: true,
          secretWord: currentRoom.secretWord,
          message: `${playerName} left the game. Game over.`,
        });
      } else {
        // If a guest leaves, just mark them disconnected or remove them depending on state
        // For now, we broadcast they left permanently
        io.to(roomCode).emit('playerLeft', {
          role,
          playerId,
          playerName,
          permanent: true,
          message: `${playerName} abandoned the match.`,
        });
      }
    },
    RECONNECT_TIMEOUT_MS
  );
}

async function handleReconnect({ roomCode, playerId, socketId }) {
  const room = roomService.getRoom(roomCode);
  if (!room) throw new Error('Room no longer exists — it may have expired');

  let role = null;

  if (room.host.playerId === playerId) {
    role = ROLES.HOST;
    room.host.socketId = socketId;
    roomService.clearReconnectTimer(`${roomCode}:host`);
  } else {
    const guest = room.guests.find(g => g.playerId === playerId);
    if (guest) {
      role = ROLES.GUEST;
      guest.socketId = socketId;
      roomService.clearReconnectTimer(`${roomCode}:guest:${playerId}`);
      await roomService.updateRoom(roomCode, { guests: room.guests });
    } else {
      throw new Error('Player not found in this room');
    }
  }

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
 */
function getRoomStateForGuest(room) {
  return {
    roomCode: room.roomCode,
    status: room.status,
    settings: room.settings,
    startedAt: room.startedAt,
    host: { name: room.host.name },
    guests: room.guests.map(g => ({
      playerId: g.playerId,
      name: g.name,
      guesses: g.guesses,
      currentAttempt: g.currentAttempt,
      hasWon: g.hasWon
    })),
    winner: room.winner,
  };
}

/**
 * Build a safe room state payload for the HOST.
 * Reveals secretWord only after the game has ended.
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
