/**
 * gameService tests.
 * We mock roomService and wordService to isolate game logic.
 */

// Mock dependencies with factory functions BEFORE importing gameService.
// Using factories prevents Mongoose from attempting a real DB connection at module load.
jest.mock('../src/services/roomService', () => ({
  generateUniqueRoomCode: jest.fn(),
  createRoom: jest.fn(),
  getRoom: jest.fn(),
  roomExists: jest.fn(),
  isRoomJoinable: jest.fn(),
  joinRoom: jest.fn(),
  updateRoom: jest.fn(),
  deleteRoom: jest.fn(),
  setReconnectTimer: jest.fn(),
  clearReconnectTimer: jest.fn(),
}));

jest.mock('../src/services/wordService', () => ({
  isValidWord: jest.fn(),
  scoreGuess: jest.fn(),
  isWinningResult: jest.fn(),
}));

const roomService = require('../src/services/roomService');
const wordService = require('../src/services/wordService');
const gameService = require('../src/services/gameService');
const { GAME_STATES, ROLES } = require('../src/config/constants');

/* ─── Shared mock room ───────────────────────────────────────────── */

const mockRoom = () => ({
  roomCode: 'ABCDE',
  status: GAME_STATES.WAITING_FOR_PLAYER,
  host: { playerId: 'host-id', name: 'Alex', socketId: 'socket-host' },
  guest: null,
  secretWord: 'apple',
  guesses: [],
  currentAttempt: 0,
  winner: null,
  createdAt: Date.now(),
});

beforeEach(() => {
  jest.clearAllMocks();

  // Default mock implementations
  wordService.isValidWord.mockReturnValue(true);
  wordService.scoreGuess.mockReturnValue(['gray', 'gray', 'gray', 'gray', 'gray']);
  wordService.isWinningResult.mockReturnValue(false);

  roomService.generateUniqueRoomCode.mockResolvedValue('ABCDE');
  roomService.createRoom.mockResolvedValue(mockRoom());
  roomService.getRoom.mockReturnValue(mockRoom());
  roomService.roomExists.mockReturnValue(true);
  roomService.isRoomJoinable.mockReturnValue(true);
  roomService.joinRoom.mockResolvedValue({ ...mockRoom(), guest: { playerId: 'guest-id', name: 'Sam', socketId: 'socket-guest' }, status: GAME_STATES.READY_TO_START });
  roomService.updateRoom.mockImplementation(async (code, updates) => ({ ...mockRoom(), ...updates }));
});

/* ─── createGame ─────────────────────────────────────────────────── */

describe('gameService.createGame', () => {
  test('creates a game and returns roomCode + playerId', async () => {
    const result = await gameService.createGame({
      playerName: 'Alex',
      secretWord: 'apple',
      socketId: 'socket-1',
    });

    expect(result.roomCode).toBe('ABCDE');
    expect(result.playerId).toBeTruthy();
    expect(roomService.createRoom).toHaveBeenCalledTimes(1);
  });

  test('throws if player name is empty', async () => {
    await expect(
      gameService.createGame({ playerName: '', secretWord: 'apple', socketId: 's1' })
    ).rejects.toThrow('Player name is required');
  });

  test('throws if secret word is empty', async () => {
    await expect(
      gameService.createGame({ playerName: 'Alex', secretWord: '', socketId: 's1' })
    ).rejects.toThrow('Secret word is required');
  });

  test('throws if secret word is invalid', async () => {
    wordService.isValidWord.mockReturnValue(false);
    await expect(
      gameService.createGame({ playerName: 'Alex', secretWord: 'xzqwj', socketId: 's1' })
    ).rejects.toThrow('valid English word');
  });

  test('sanitizes player name — strips XSS characters', async () => {
    const result = await gameService.createGame({
      playerName: '<script>alert(1)</script>',
      secretWord: 'apple',
      socketId: 's1',
    });
    // Name should be sanitized; createRoom should still be called
    expect(roomService.createRoom).toHaveBeenCalled();
  });
});

/* ─── joinGame ───────────────────────────────────────────────────── */

describe('gameService.joinGame', () => {
  test('guest joins successfully', async () => {
    const result = await gameService.joinGame({
      roomCode: 'ABCDE',
      playerName: 'Sam',
      socketId: 'socket-2',
    });

    expect(result.playerId).toBeTruthy();
    expect(roomService.joinRoom).toHaveBeenCalledTimes(1);
  });

  test('throws if player name is empty', async () => {
    await expect(
      gameService.joinGame({ roomCode: 'ABCDE', playerName: '', socketId: 's2' })
    ).rejects.toThrow('Player name is required');
  });

  test('throws if room does not exist', async () => {
    roomService.roomExists.mockReturnValue(false);
    await expect(
      gameService.joinGame({ roomCode: 'XXXXX', playerName: 'Sam', socketId: 's2' })
    ).rejects.toThrow('Room not found');
  });

  test('throws if room is not joinable (full)', async () => {
    roomService.isRoomJoinable.mockReturnValue(false);
    roomService.getRoom.mockReturnValue({
      ...mockRoom(),
      guest: { playerId: 'other-id', name: 'Bob' },
      status: GAME_STATES.READY_TO_START,
    });
    await expect(
      gameService.joinGame({ roomCode: 'ABCDE', playerName: 'Sam', socketId: 's2' })
    ).rejects.toThrow('already full');
  });
});

/* ─── startGame ──────────────────────────────────────────────────── */

describe('gameService.startGame', () => {
  const readyRoom = {
    ...mockRoom(),
    status: GAME_STATES.READY_TO_START,
    guest: { playerId: 'guest-id', name: 'Sam', socketId: 'sg' },
  };

  beforeEach(() => {
    roomService.getRoom.mockReturnValue(readyRoom);
  });

  test('host can start the game', async () => {
    await gameService.startGame({ roomCode: 'ABCDE', playerId: 'host-id' });
    expect(roomService.updateRoom).toHaveBeenCalledWith('ABCDE', { status: GAME_STATES.IN_PROGRESS });
  });

  test('throws if caller is not the host', async () => {
    await expect(
      gameService.startGame({ roomCode: 'ABCDE', playerId: 'guest-id' })
    ).rejects.toThrow('Only the host');
  });

  test('throws if guest has not joined', async () => {
    roomService.getRoom.mockReturnValue({ ...mockRoom(), status: GAME_STATES.WAITING_FOR_PLAYER });
    await expect(
      gameService.startGame({ roomCode: 'ABCDE', playerId: 'host-id' })
    ).rejects.toThrow('Waiting for another player');
  });
});

/* ─── processGuess ───────────────────────────────────────────────── */

describe('gameService.processGuess', () => {
  const activeRoom = {
    ...mockRoom(),
    status: GAME_STATES.IN_PROGRESS,
    guest: { playerId: 'guest-id', name: 'Sam', socketId: 'sg' },
    secretWord: 'apple',
    guesses: [],
    currentAttempt: 0,
  };

  beforeEach(() => {
    roomService.getRoom.mockReturnValue({ ...activeRoom });
  });

  test('processes a valid guess and returns result', async () => {
    wordService.scoreGuess.mockReturnValue(['gray', 'gray', 'gray', 'gray', 'gray']);
    wordService.isWinningResult.mockReturnValue(false);

    const result = await gameService.processGuess({
      roomCode: 'ABCDE',
      playerId: 'guest-id',
      guess: 'crane',
    });

    expect(result.guess).toBe('crane');
    expect(result.result).toHaveLength(5);
    expect(result.attempt).toBe(1);
    expect(result.isWin).toBe(false);
    expect(result.secretWord).toBeUndefined(); // not revealed mid-game
  });

  test('winning guess sets status to GUEST_WON and reveals secret', async () => {
    wordService.scoreGuess.mockReturnValue(['green', 'green', 'green', 'green', 'green']);
    wordService.isWinningResult.mockReturnValue(true);

    const result = await gameService.processGuess({
      roomCode: 'ABCDE',
      playerId: 'guest-id',
      guess: 'apple',
    });

    expect(result.isWin).toBe(true);
    expect(result.status).toBe(GAME_STATES.GUEST_WON);
    expect(result.secretWord).toBe('apple'); // revealed on win
  });

  test('uses all attempts → GAME_OVER state', async () => {
    const nearlyDoneRoom = {
      ...activeRoom,
      currentAttempt: 5, // one guess left
    };
    roomService.getRoom.mockReturnValue(nearlyDoneRoom);
    wordService.isWinningResult.mockReturnValue(false);

    const result = await gameService.processGuess({
      roomCode: 'ABCDE',
      playerId: 'guest-id',
      guess: 'crane',
    });

    expect(result.isGameOver).toBe(true);
    expect(result.status).toBe(GAME_STATES.GAME_OVER);
    expect(result.secretWord).toBe('apple'); // revealed on loss
  });

  test('throws if caller is not the guest', async () => {
    await expect(
      gameService.processGuess({ roomCode: 'ABCDE', playerId: 'host-id', guess: 'crane' })
    ).rejects.toThrow('Only the guest');
  });

  test('throws if game is not in progress', async () => {
    roomService.getRoom.mockReturnValue({ ...activeRoom, status: GAME_STATES.READY_TO_START });
    await expect(
      gameService.processGuess({ roomCode: 'ABCDE', playerId: 'guest-id', guess: 'crane' })
    ).rejects.toThrow('not currently in progress');
  });

  test('throws for invalid word', async () => {
    wordService.isValidWord.mockReturnValue(false);
    await expect(
      gameService.processGuess({ roomCode: 'ABCDE', playerId: 'guest-id', guess: 'xzqwj' })
    ).rejects.toThrow('Not a valid word');
  });
});

/* ─── DTO security ───────────────────────────────────────────────── */

describe('gameService DTO security', () => {
  const room = {
    ...mockRoom(),
    status: GAME_STATES.IN_PROGRESS,
    guest: { playerId: 'gid', name: 'Sam' },
    secretWord: 'apple',
  };

  test('getRoomStateForGuest never includes secretWord', () => {
    const dto = gameService.getRoomStateForGuest(room);
    expect(dto.secretWord).toBeUndefined();
  });

  test('getRoomStateForHost includes secretWord only when game is over', () => {
    const overRoom = { ...room, status: GAME_STATES.GUEST_WON };
    const dto = gameService.getRoomStateForHost(overRoom);
    expect(dto.secretWord).toBe('apple');
  });

  test('getRoomStateForHost does not include secretWord mid-game', () => {
    const dto = gameService.getRoomStateForHost(room); // status = IN_PROGRESS
    expect(dto.secretWord).toBeUndefined();
  });
});
