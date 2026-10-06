const gameService = require('../services/gameService');
const roomService = require('../services/roomService');
const wordService = require('../services/wordService');
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
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const { playerName, secretWord, maxGuests, timerMinutes, oldRoomCode, isRandomWord } = data;

      if (!isValidString(playerName, 20)) {
        return emitError(socket, 'INVALID_NAME', 'Please enter a valid name (max 20 characters)');
      }

      let finalSecretWord = secretWord;
      if (isRandomWord) {
        finalSecretWord = wordService.getRandomWord();
      } else if (!isValidString(secretWord, 10)) {
        return emitError(socket, 'INVALID_WORD', 'Please enter a secret word');
      }

      const { room, playerId, roomCode } = await gameService.createGame({
        playerName,
        secretWord: finalSecretWord,
        socketId: socket.id,
        maxGuests: maxGuests || 5,
        timerMinutes: timerMinutes || 5,
      });

      socket.join(roomCode);

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const joinUrl = `${clientUrl}/#/join/${roomCode}`;

      socket.emit('gameCreated', {
        roomCode,
        playerId,
        joinUrl,
        hostName: sanitizeName(playerName),
        status: room.status,
        settings: room.settings
      });

      // Phase 4: Host Rotation — Notify old room if this is a follow-up match
      if (oldRoomCode && isValidRoomCode(oldRoomCode)) {
        socket.to(oldRoomCode).emit('nextMatchReady', {
          newRoomCode: roomCode,
          hostName: sanitizeName(playerName)
        });
      }

      console.log(`🎮 Game created: ${roomCode} by ${sanitizeName(playerName)}`);
    } catch (err) {
      console.error('createGame error:', err.message);
      emitError(socket, 'CREATE_FAILED', err.message || 'Failed to create game');
    }
  });

  socket.on('joinGame', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const { playerName, playerId: existingPlayerId } = data;
      const roomCode = sanitizeRoomCode(data.roomCode);

      if (!isValidRoomCode(roomCode)) {
        return emitError(socket, 'INVALID_CODE', 'Invalid room code format');
      }
      if (!isValidString(playerName, 20)) {
        return emitError(socket, 'INVALID_NAME', 'Please enter a valid name (max 20 characters)');
      }

      const { room, playerId } = await gameService.joinGame({
        roomCode,
        playerName,
        socketId: socket.id,
        existingPlayerId: existingPlayerId || null,
      });

      socket.join(roomCode);

      socket.to(roomCode).emit('playerJoined', {
        guestName: sanitizeName(playerName),
        playerId,
        status: room.status,
        guests: room.guests
      });

      socket.emit('gameJoined', {
        roomCode,
        playerId,
        hostName: room.host.name,
        guestName: sanitizeName(playerName),
        status: room.status,
        guests: room.guests,
        settings: room.settings
      });

      console.log(`👤 ${sanitizeName(playerName)} joined room ${roomCode}`);
    } catch (err) {
      console.error('joinGame error:', err.message);
      emitError(socket, 'JOIN_FAILED', err.message || 'Failed to join game');
    }
  });

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

      const { MAX_ATTEMPTS } = require('../config/constants');

      io.to(roomCode).emit('gameStarted', {
        status: room.status,
        startedAt: room.startedAt,
        maxAttempts: MAX_ATTEMPTS,
        hostName: room.host.name,
        guests: room.guests,
      });

      console.log(`▶️  Game started: ${roomCode}`);
    } catch (err) {
      console.error('startGame error:', err.message);
      emitError(socket, 'START_FAILED', err.message || 'Failed to start game');
    }
  });

  socket.on('submitGuess', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        return emitError(socket, 'INVALID_PAYLOAD', 'Invalid request payload');
      }

      const roomCode = sanitizeRoomCode(data.roomCode);
      const { playerId, guess } = data;

      if (!isValidRoomCode(roomCode)) {
        return emitError(socket, 'INVALID_CODE', 'Invalid room code');
      }
      if (!isValidString(playerId, 50)) {
        return emitError(socket, 'INVALID_PLAYER', 'Invalid player ID');
      }
      const normalizedGuess = sanitizeWord(guess);
      if (!normalizedGuess) {
        return emitError(socket, 'INVALID_GUESS', 'Please enter a word to guess');
      }

      if (!checkGuessRateLimit(guessTimestamps, socket.id, GUESS_WINDOW_MS, GUESS_MAX)) {
        return emitError(socket, 'RATE_LIMITED', 'You are guessing too fast. Please slow down.');
      }

      const result = await gameService.processGuess({ roomCode, playerId, guess: normalizedGuess });

      socket.emit('guessResult', {
        guess: result.guess,
        result: result.result,
        attempt: result.attempt,
        status: result.status,
        isWin: result.isWin,
        isGameOver: result.isGameOver,
        secretWord: result.secretWord,
      });

      const hostPayload = {
        playerId,
        guestName: result.guestName,
        attempt: result.attempt,
        result: result.result,
        guess: result.guess, // Included as requested so host sees the actual word
        status: result.status,
      };

      if (result.isWin || result.isGameOver) {
        hostPayload.secretWord = result.secretWord;
      }

      socket.to(roomCode).emit('guessUpdate', hostPayload);

      if (result.isWin) {
        io.to(roomCode).emit('gameWon', {
          winner: playerId,
          guestName: result.guestName,
          secretWord: result.secretWord,
          attempts: result.attempt,
          status: result.status,
        });
        console.log(`🏆 ${result.guestName} won room ${roomCode} in ${result.attempt} attempt(s)`);
      } else if (result.isGameOver) {
        io.to(roomCode).emit('gameLost', {
          guestName: result.guestName,
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

  socket.on('timeUp', async (data) => {
    try {
      const roomCode = sanitizeRoomCode(data?.roomCode);
      if (!isValidRoomCode(roomCode)) return;
      
      const room = roomService.getRoom(roomCode);
      if (!room || room.status !== GAME_STATES.IN_PROGRESS) return;
      
      await roomService.updateRoom(roomCode, { status: GAME_STATES.GAME_OVER });
      io.to(roomCode).emit('gameLost', {
        secretWord: room.secretWord,
        status: GAME_STATES.GAME_OVER,
        reason: 'timeUp'
      });
      console.log(`⏰ Time is up in room ${roomCode}. Word was: ${room.secretWord}`);
    } catch (err) {
      console.error('timeUp error:', err.message);
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
        playerId,
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
