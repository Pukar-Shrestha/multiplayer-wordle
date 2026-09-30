const gameService = require('../services/gameService');
const roomService = require('../services/roomService');
const { sanitizeRoomCode, sanitizeWord, sanitizeName, isValidString } = require('../utils/sanitize');
const { checkGuessRateLimit } = require('../middleware/rateLimiter');
const { GAME_STATES, ROLES, ROOM_CODE_REGEX } = require('../config/constants');

// ── Per-socket guess rate-limit store ────────────────────────────────────────
// Maps socketId → array of recent guess timestamps.
// Cleared when the socket disconnects.
const guessTimestamps = new Map();

const GUESS_WINDOW_MS = parseInt(process.env.GUESS_RATE_LIMIT_WINDOW_MS || '2000', 10);
const GUESS_MAX = parseInt(process.env.GUESS_RATE_LIMIT_MAX || '2', 10);

// ── Helper: emit a structured error to a single socket ───────────────────────
function emitError(socket, code, message) {
  socket.emit('error', { code, message });
}

// ── Helper: validate room code format ────────────────────────────────────────
function isValidRoomCode(code) {
  return typeof code === 'string' && ROOM_CODE_REGEX.test(code);
}

// ── Main socket handler — called once per connection ─────────────────────────
function registerGameSocket(io, socket) {
  console.log(`🔌 Socket connected: ${socket.id}`);

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: createGame
   * Emitted by: Host
   * Payload:    { playerName: string, secretWord: string }
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('createGame', async (data) => {
    try {
      // Input validation
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const { playerName, secretWord } = data;

      if (!isValidString(playerName, 20)) {
        return emitError(socket, 'INVALID_NAME', 'Please enter a valid name (max 20 characters)');
      }
      if (!isValidString(secretWord, 10)) {
        return emitError(socket, 'INVALID_WORD', 'Please enter a secret word');
      }

      // Delegate to game service (validates word against dictionary server-side)
      const { room, playerId, roomCode } = await gameService.createGame({
        playerName,
        secretWord,
        socketId: socket.id,
      });

      // Join the Socket.IO room
      socket.join(roomCode);

      // Build the join URL using the configured client URL
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const joinUrl = `${clientUrl}/join/${roomCode}`;

      // Respond to the host only
      socket.emit('gameCreated', {
        roomCode,
        playerId,
        joinUrl,
        hostName: sanitizeName(playerName),
        status: room.status,
      });

      console.log(`🎮 Game created: ${roomCode} by ${sanitizeName(playerName)}`);
    } catch (err) {
      console.error('createGame error:', err.message);
      emitError(socket, 'CREATE_FAILED', err.message || 'Failed to create game');
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: joinGame
   * Emitted by: Guest
   * Payload:    { roomCode: string, playerName: string, playerId?: string }
   *
   * The guest's browser NEVER receives secretWord at any point here.
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('joinGame', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const { playerName, playerId: existingPlayerId } = data;
      const roomCode = sanitizeRoomCode(data.roomCode);

      // Validate room code format
      if (!isValidRoomCode(roomCode)) {
        return emitError(socket, 'INVALID_CODE', 'Invalid room code format');
      }

      // Validate player name
      if (!isValidString(playerName, 20)) {
        return emitError(socket, 'INVALID_NAME', 'Please enter a valid name (max 20 characters)');
      }

      // Attempt to join (throws descriptive errors for all failure modes)
      const { room, playerId } = await gameService.joinGame({
        roomCode,
        playerName,
        socketId: socket.id,
        existingPlayerId: existingPlayerId || null,
      });

      // Add this socket to the Socket.IO room
      socket.join(roomCode);

      // Notify the host that a guest has joined
      socket.to(roomCode).emit('playerJoined', {
        guestName: sanitizeName(playerName),
        playerId,
        status: room.status,
      });

      // Confirm to the guest — safe DTO only (no secretWord)
      socket.emit('gameJoined', {
        roomCode,
        playerId,
        hostName: room.host.name,
        guestName: sanitizeName(playerName),
        status: room.status,
      });

      console.log(`👤 ${sanitizeName(playerName)} joined room ${roomCode}`);
    } catch (err) {
      console.error('joinGame error:', err.message);
      emitError(socket, 'JOIN_FAILED', err.message || 'Failed to join game');
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: startGame
   * Emitted by: Host only
   * Payload:    { roomCode: string, playerId: string }
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('startGame', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const roomCode = sanitizeRoomCode(data.roomCode);
      const { playerId } = data;

      if (!isValidRoomCode(roomCode)) {
        return emitError(socket, 'INVALID_CODE', 'Invalid room code');
      }
      if (!isValidString(playerId, 50)) {
        return emitError(socket, 'INVALID_PLAYER', 'Invalid player ID');
      }

      const room = await gameService.startGame({ roomCode, playerId });

      // Notify BOTH players — game is starting
      // MAX_ATTEMPTS is baked into the payload so the client doesn't hardcode it
      const { MAX_ATTEMPTS } = require('../config/constants');

      io.to(roomCode).emit('gameStarted', {
        status: room.status,
        maxAttempts: MAX_ATTEMPTS,
        hostName: room.host.name,
        guestName: room.guest.name,
        // ⛔ secretWord is NEVER included here
      });

      console.log(`▶️  Game started: ${roomCode}`);
    } catch (err) {
      console.error('startGame error:', err.message);
      emitError(socket, 'START_FAILED', err.message || 'Failed to start game');
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: submitGuess
   * Emitted by: Guest only
   * Payload:    { roomCode: string, playerId: string, guess: string }
   *
   * The server is fully authoritative:
   *   - validates room, player, state, length, dictionary
   *   - calculates Wordle result
   *   - decides win/lose
   *   - broadcasts outcome
   *
   * The host receives guess progress but NEVER the secret word until game ends.
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('submitGuess', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const roomCode = sanitizeRoomCode(data.roomCode);
      const { playerId, guess } = data;

      // Validate room code
      if (!isValidRoomCode(roomCode)) {
        return emitError(socket, 'INVALID_CODE', 'Invalid room code');
      }

      // Validate player ID
      if (!isValidString(playerId, 50)) {
        return emitError(socket, 'INVALID_PLAYER', 'Invalid player ID');
      }

      // Validate guess input
      const normalizedGuess = sanitizeWord(guess);
      if (!normalizedGuess) {
        return emitError(socket, 'INVALID_GUESS', 'Please enter a word to guess');
      }

      // ── Rate limiting ──────────────────────────────────────────────────────
      if (!checkGuessRateLimit(guessTimestamps, socket.id, GUESS_WINDOW_MS, GUESS_MAX)) {
        return emitError(socket, 'RATE_LIMITED', 'You are guessing too fast. Please slow down.');
      }

      // ── Server-authoritative processing ───────────────────────────────────
      const result = await gameService.processGuess({ roomCode, playerId, guess: normalizedGuess });

      // Send detailed result to the guest (includes secretWord only if game ends)
      socket.emit('guessResult', {
        guess: result.guess,
        result: result.result,
        attempt: result.attempt,
        status: result.status,
        isWin: result.isWin,
        isGameOver: result.isGameOver,
        secretWord: result.secretWord, // undefined mid-game, revealed on end
      });

      // Send progress-only update to the host (NO secret word while game is live)
      const room = roomService.getRoom(roomCode);
      const hostPayload = {
        attempt: result.attempt,
        result: result.result, // tile colors only — word not included
        status: result.status,
        guestName: room?.guest?.name,
      };

      // Only reveal the secret word to the host when game ends
      if (result.isWin || result.isGameOver) {
        hostPayload.secretWord = result.secretWord;
        hostPayload.guestName = room?.guest?.name;
      }

      socket.to(roomCode).emit('guessUpdate', hostPayload);

      // ── Terminal game events ───────────────────────────────────────────────
      if (result.isWin) {
        io.to(roomCode).emit('gameWon', {
          winner: ROLES.GUEST,
          guestName: room?.guest?.name,
          hostName: room?.host?.name,
          secretWord: result.secretWord,
          attempts: result.attempt,
          status: result.status,
        });
        console.log(`🏆 ${room?.guest?.name} won room ${roomCode} in ${result.attempt} attempt(s)`);
      } else if (result.isGameOver) {
        io.to(roomCode).emit('gameLost', {
          guestName: room?.guest?.name,
          hostName: room?.host?.name,
          secretWord: result.secretWord,
          attempts: result.attempt,
          status: result.status,
        });
        console.log(`❌ Game over in room ${roomCode}. Word was: ${result.secretWord}`);
      }
    } catch (err) {
      console.error('submitGuess error:', err.message);
      emitError(socket, 'GUESS_FAILED', err.message || 'Failed to process guess');
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: reconnectPlayer
   * Emitted by: Any player returning after a disconnect
   * Payload:    { roomCode: string, playerId: string }
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('reconnectPlayer', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const roomCode = sanitizeRoomCode(data.roomCode);
      const { playerId } = data;

      if (!isValidRoomCode(roomCode)) {
        return emitError(socket, 'INVALID_CODE', 'Invalid room code');
      }
      if (!isValidString(playerId, 50)) {
        return emitError(socket, 'INVALID_PLAYER', 'Invalid player ID');
      }

      const { room, role } = await gameService.handleReconnect({
        roomCode,
        playerId,
        socketId: socket.id,
      });

      // Re-join the Socket.IO room
      socket.join(roomCode);

      // Send the appropriate state (guest DTO never includes secretWord mid-game)
      const statePayload =
        role === ROLES.HOST
          ? gameService.getRoomStateForHost(room)
          : gameService.getRoomStateForGuest(room);

      socket.emit('reconnected', {
        role,
        roomState: statePayload,
      });

      // Notify the other player that their opponent is back
      socket.to(roomCode).emit('playerReconnected', {
        role,
        playerName: role === ROLES.HOST ? room.host.name : room.guest?.name,
      });

      console.log(`🔄 Player reconnected to ${roomCode} as ${role}`);
    } catch (err) {
      console.error('reconnectPlayer error:', err.message);
      emitError(socket, 'RECONNECT_FAILED', err.message || 'Could not reconnect to game');
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: disconnect
   * Fired automatically by Socket.IO when a socket drops.
   * We look up which room/role this socket belonged to, then start a
   * grace-period timer to allow reconnection before ending the game.
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} — reason: ${reason}`);

    // Clean up the guess rate-limit store for this socket
    guessTimestamps.delete(socket.id);

    // Find which room this socket was in
    for (const [roomCode, room] of roomService.rooms) {
      let role = null;

      if (room.host.socketId === socket.id) {
        role = ROLES.HOST;
      } else if (room.guest && room.guest.socketId === socket.id) {
        role = ROLES.GUEST;
      }

      if (!role) continue;

      // Skip rooms that are already ended
      const endedStates = [
        GAME_STATES.GUEST_WON,
        GAME_STATES.GAME_OVER,
        GAME_STATES.PLAYER_DISCONNECTED,
      ];
      if (endedStates.includes(room.status)) break;

      console.log(`⚠️  ${role} disconnected from room ${roomCode}`);

      gameService.handleDisconnect({ roomCode, playerId: null, role, io });
      break;
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * EVENT: leaveGame  (optional — graceful exit from lobby/game)
   * Emitted by: Either player
   * Payload:    { roomCode: string, playerId: string }
   * ──────────────────────────────────────────────────────────────────────── */
  socket.on('leaveGame', async (data) => {
    try {
      if (!data || typeof data !== 'object') return;

      const roomCode = sanitizeRoomCode(data.roomCode);
      const { playerId } = data;

      if (!isValidRoomCode(roomCode) || !isValidString(playerId, 50)) return;

      const room = roomService.getRoom(roomCode);
      if (!room) return;

      let role = null;
      let playerName = '';

      if (room.host.playerId === playerId) {
        role = ROLES.HOST;
        playerName = room.host.name;
      } else if (room.guest && room.guest.playerId === playerId) {
        role = ROLES.GUEST;
        playerName = room.guest.name;
      }

      if (!role) return;

      socket.leave(roomCode);

      // Notify the remaining player
      socket.to(roomCode).emit('playerLeft', {
        role,
        playerName,
        permanent: true,
        secretWord: room.secretWord, // reveal word when someone leaves
        message: `${playerName} left the game.`,
      });

      // Clean up room if host leaves (no point continuing)
      if (role === ROLES.HOST) {
        await roomService.deleteRoom(roomCode);
      }

      console.log(`🚪 ${playerName} (${role}) left room ${roomCode}`);
    } catch (err) {
      console.error('leaveGame error:', err.message);
    }
  });
}

module.exports = registerGameSocket;
