/**
 * Socket.IO integration tests.
 *
 * These tests spin up a real in-process server (no external MongoDB needed —
 * we mock Mongoose) and connect real socket clients to verify the full
 * event flow end-to-end.
 */

// Mock DB so the server doesn't need a real MongoDB
jest.mock('../src/config/db', () => jest.fn().mockResolvedValue(true));

// Mock Game model to avoid Mongoose connection
jest.mock('../src/models/Game', () => {
  const mockSave = jest.fn().mockResolvedValue(true);
  const MockGame = jest.fn().mockImplementation(() => ({ save: mockSave }));
  MockGame.findOneAndUpdate = jest.fn().mockResolvedValue(true);
  MockGame.deleteOne = jest.fn().mockResolvedValue(true);
  MockGame.findOne = jest.fn().mockResolvedValue(null);
  MockGame.deleteMany = jest.fn().mockResolvedValue(true);
  return MockGame;
});

const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');

const app = require('../src/app');
const registerGameSocket = require('../src/sockets/gameSocket');
const roomService = require('../src/services/roomService');

let server, io, hostSocket, guestSocket;
const PORT = 5099; // Use a non-default port to avoid conflicts

/* ─── Server setup / teardown ────────────────────────────────────── */

beforeAll((done) => {
  server = http.createServer(app);
  io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket'],
  });
  io.on('connection', (socket) => registerGameSocket(io, socket));
  server.listen(PORT, done);
});

afterAll((done) => {
  io.close();
  server.close(done);
});

beforeEach((done) => {
  roomService.rooms.clear();

  hostSocket = ClientIO(`http://localhost:${PORT}`, {
    transports: ['websocket'],
    forceNew: true,
  });
  guestSocket = ClientIO(`http://localhost:${PORT}`, {
    transports: ['websocket'],
    forceNew: true,
  });

  let connected = 0;
  const onConnect = () => { if (++connected === 2) done(); };
  hostSocket.on('connect', onConnect);
  guestSocket.on('connect', onConnect);
});

afterEach((done) => {
  hostSocket.disconnect();
  guestSocket.disconnect();
  roomService.rooms.clear();
  setTimeout(done, 50);
});

/* ─── Helper: create a game and return roomCode + playerId ────────── */
function createGame(name = 'Alex', word = 'apple') {
  return new Promise((resolve, reject) => {
    hostSocket.emit('createGame', { playerName: name, secretWord: word });
    hostSocket.once('gameCreated', resolve);
    hostSocket.once('error', reject);
  });
}

/* ─── createGame ─────────────────────────────────────────────────── */

describe('createGame', () => {
  test('emits gameCreated with roomCode, playerId, joinUrl', (done) => {
    hostSocket.emit('createGame', { playerName: 'Alex', secretWord: 'apple' });

    hostSocket.once('gameCreated', (data) => {
      expect(data.roomCode).toMatch(/^[A-Z0-9]{5}$/);
      expect(data.playerId).toBeTruthy();
      expect(data.joinUrl).toContain('/join/');
      done();
    });
  });

  test('emits error for missing player name', (done) => {
    hostSocket.emit('createGame', { playerName: '', secretWord: 'apple' });
    hostSocket.once('error', (err) => {
      expect(err.code).toBe('INVALID_NAME');
      done();
    });
  });

  test('emits error for invalid secret word (not in dictionary)', (done) => {
    hostSocket.emit('createGame', { playerName: 'Alex', secretWord: 'xzqwj' });
    hostSocket.once('error', (err) => {
      expect(err.code).toBe('CREATE_FAILED');
      done();
    });
  });
});

/* ─── joinGame ───────────────────────────────────────────────────── */

describe('joinGame', () => {
  test('guest receives gameJoined; host receives playerJoined', (done) => {
    createGame().then(({ roomCode }) => {
      let hostNotified = false;
      let guestNotified = false;

      const check = () => { if (hostNotified && guestNotified) done(); };

      hostSocket.once('playerJoined', (data) => {
        expect(data.guestName).toBe('Sam');
        hostNotified = true;
        check();
      });

      guestSocket.emit('joinGame', { roomCode, playerName: 'Sam' });
      guestSocket.once('gameJoined', (data) => {
        expect(data.roomCode).toBe(roomCode);
        expect(data.playerId).toBeTruthy();
        // ⛔ secretWord must never appear in the guest join payload
        expect(data.secretWord).toBeUndefined();
        guestNotified = true;
        check();
      });
    });
  });

  test('emits error for unknown room code', (done) => {
    guestSocket.emit('joinGame', { roomCode: 'ZZZZZ', playerName: 'Sam' });
    guestSocket.once('error', (err) => {
      expect(err.code).toBe('JOIN_FAILED');
      done();
    });
  });

  test('emits error for missing player name', (done) => {
    createGame().then(({ roomCode }) => {
      guestSocket.emit('joinGame', { roomCode, playerName: '' });
      guestSocket.once('error', (err) => {
        expect(err.code).toBe('INVALID_NAME');
        done();
      });
    });
  });
});

/* ─── startGame ──────────────────────────────────────────────────── */

describe('startGame', () => {
  async function setupReadyRoom() {
    const { roomCode, playerId: hostId } = await createGame();
    await new Promise((resolve) => {
      hostSocket.once('playerJoined', resolve);
      guestSocket.emit('joinGame', { roomCode, playerName: 'Sam' });
    });
    return { roomCode, hostId };
  }

  test('host starts game; both players receive gameStarted', (done) => {
    setupReadyRoom().then(({ roomCode, hostId }) => {
      let hostGot = false;
      let guestGot = false;

      const check = () => { if (hostGot && guestGot) done(); };

      hostSocket.once('gameStarted', (data) => {
        expect(data.status).toBe('IN_PROGRESS');
        expect(data.maxAttempts).toBe(6);
        // ⛔ secretWord must not appear in gameStarted
        expect(data.secretWord).toBeUndefined();
        hostGot = true;
        check();
      });

      guestSocket.once('gameStarted', (data) => {
        expect(data.secretWord).toBeUndefined();
        guestGot = true;
        check();
      });

      hostSocket.emit('startGame', { roomCode, playerId: hostId });
    });
  });

  test('guest cannot start the game', (done) => {
    setupReadyRoom().then(({ roomCode }) => {
      // Get guest's playerId from their join response
      guestSocket.emit('startGame', { roomCode, playerId: 'wrong-id' });
      guestSocket.once('error', (err) => {
        expect(err.code).toBe('START_FAILED');
        done();
      });
    });
  });
});

/* ─── submitGuess ────────────────────────────────────────────────── */

describe('submitGuess', () => {
  let roomCode, hostId, guestId;

  beforeEach((done) => {
    createGame('Alex', 'apple').then(({ roomCode: rc, playerId: hId }) => {
      roomCode = rc;
      hostId = hId;

      guestSocket.emit('joinGame', { roomCode, playerName: 'Sam' });
      guestSocket.once('gameJoined', ({ playerId }) => {
        guestId = playerId;
        hostSocket.emit('startGame', { roomCode, playerId: hostId });
        hostSocket.once('gameStarted', () => done());
      });
    });
  });

  test('guest submits guess; receives guessResult; host receives guessUpdate without secretWord', (done) => {
    let guestGot = false;
    let hostGot = false;

    const check = () => { if (guestGot && hostGot) done(); };

    guestSocket.once('guessResult', (data) => {
      expect(data.guess).toBe('crane');
      expect(data.result).toHaveLength(5);
      expect(data.attempt).toBe(1);
      // Word should NOT be revealed mid-game
      expect(data.secretWord).toBeUndefined();
      guestGot = true;
      check();
    });

    hostSocket.once('guessUpdate', (data) => {
      expect(data.result).toHaveLength(5);
      // ⛔ host must not see secretWord mid-game
      expect(data.secretWord).toBeUndefined();
      hostGot = true;
      check();
    });

    guestSocket.emit('submitGuess', { roomCode, playerId: guestId, guess: 'crane' });
  });

  test('emits error for an invalid word', (done) => {
    guestSocket.emit('submitGuess', { roomCode, playerId: guestId, guess: 'xzqwj' });
    guestSocket.once('error', (err) => {
      expect(err.code).toBe('GUESS_FAILED');
      done();
    });
  });

  test('host cannot submit a guess', (done) => {
    hostSocket.emit('submitGuess', { roomCode, playerId: hostId, guess: 'crane' });
    hostSocket.once('error', (err) => {
      expect(err.code).toBe('GUESS_FAILED');
      done();
    });
  });

  test('correct guess triggers gameWon with secretWord revealed', (done) => {
    let hostGotWin = false;
    let guestGotWin = false;

    const check = () => { if (hostGotWin && guestGotWin) done(); };

    hostSocket.once('gameWon', (data) => {
      expect(data.secretWord).toBe('apple');
      expect(data.winner).toBe('guest');
      hostGotWin = true;
      check();
    });

    guestSocket.once('gameWon', (data) => {
      expect(data.secretWord).toBe('apple');
      guestGotWin = true;
      check();
    });

    // 'apple' is the secret word — exact guess
    guestSocket.emit('submitGuess', { roomCode, playerId: guestId, guess: 'apple' });
  });
});

/* ─── Security: unauthorized events ─────────────────────────────── */

describe('Security', () => {
  test('rejects submitGuess with invalid room code format', (done) => {
    guestSocket.emit('submitGuess', { roomCode: 'bad!', playerId: 'x', guess: 'crane' });
    guestSocket.once('error', (err) => {
      expect(err.code).toBe('INVALID_CODE');
      done();
    });
  });

  test('rejects joinGame with malformed payload', (done) => {
    guestSocket.emit('joinGame', null);
    guestSocket.once('error', (err) => {
      expect(err.code).toBe('INVALID_PAYLOAD');
      done();
    });
  });

  test('rejects reconnectPlayer for unknown room', (done) => {
    guestSocket.emit('reconnectPlayer', { roomCode: 'ZZZZZ', playerId: 'some-id' });
    guestSocket.once('error', (err) => {
      expect(err.code).toBe('RECONNECT_FAILED');
      done();
    });
  });
});
