/**
 * roomService tests.
 * We mock the entire Mongoose Game model before importing roomService
 * so that no real DB connection is needed.
 */

// Must mock Game BEFORE requiring roomService (which imports Game)
jest.mock('../src/models/Game', () => {
  const mockSave = jest.fn().mockResolvedValue(true);
  const MockGame = jest.fn().mockImplementation(() => ({ save: mockSave }));
  MockGame.findOneAndUpdate = jest.fn().mockResolvedValue(true);
  MockGame.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  MockGame.findOne = jest.fn().mockResolvedValue(null);
  MockGame.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
  return MockGame;
});

const Game = require('../src/models/Game');
const roomService = require('../src/services/roomService');
const { GAME_STATES } = require('../src/config/constants');

/* ─── Helpers ────────────────────────────────────────────────────── */

const makeHost = (id = 'host-id') => ({
  playerId: id,
  name: 'Alex',
  socketId: 'socket-host',
});

const makeGuest = (id = 'guest-id') => ({
  playerId: id,
  name: 'Sam',
  socketId: 'socket-guest',
});

beforeEach(() => {
  jest.clearAllMocks();
  // Clear the in-memory Map between tests for isolation
  roomService.rooms.clear();
});

/* ─── createRoom ─────────────────────────────────────────────────── */

describe('roomService.createRoom', () => {
  test('adds room to in-memory map and calls Game constructor + save', async () => {
    const room = await roomService.createRoom({
      roomCode: 'ABCDE',
      hostPlayer: makeHost(),
      secretWord: 'apple',
    });

    expect(room.roomCode).toBe('ABCDE');
    expect(room.status).toBe(GAME_STATES.WAITING_FOR_PLAYER);
    expect(room.secretWord).toBe('apple');
    expect(room.guest).toBeNull();
    expect(roomService.rooms.has('ABCDE')).toBe(true);
    expect(Game).toHaveBeenCalledTimes(1);
  });

  test('room has correct host info', async () => {
    const room = await roomService.createRoom({
      roomCode: 'TESTA',
      hostPlayer: makeHost('my-id'),
      secretWord: 'brave',
    });
    expect(room.host.playerId).toBe('my-id');
    expect(room.host.name).toBe('Alex');
  });
});

/* ─── getRoom ────────────────────────────────────────────────────── */

describe('roomService.getRoom', () => {
  test('returns room if it exists', async () => {
    await roomService.createRoom({ roomCode: 'GETME', hostPlayer: makeHost(), secretWord: 'crane' });
    const room = roomService.getRoom('GETME');
    expect(room).not.toBeNull();
    expect(room.roomCode).toBe('GETME');
  });

  test('returns null for unknown code', () => {
    expect(roomService.getRoom('ZZZZZ')).toBeNull();
  });
});

/* ─── joinRoom ───────────────────────────────────────────────────── */

describe('roomService.joinRoom', () => {
  beforeEach(async () => {
    await roomService.createRoom({ roomCode: 'JOIN1', hostPlayer: makeHost(), secretWord: 'lemon' });
  });

  test('adds guest and updates status to READY_TO_START', async () => {
    const room = await roomService.joinRoom('JOIN1', makeGuest());
    expect(room.guest.name).toBe('Sam');
    expect(room.guest.playerId).toBe('guest-id');
    expect(room.status).toBe(GAME_STATES.READY_TO_START);
    expect(Game.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('throws if room does not exist', async () => {
    await expect(roomService.joinRoom('NOPE1', makeGuest())).rejects.toThrow('Room not found');
  });

  test('throws if room already has a guest (room is full)', async () => {
    await roomService.joinRoom('JOIN1', makeGuest('first-guest'));
    // Status is now READY_TO_START, not WAITING_FOR_PLAYER
    await expect(roomService.joinRoom('JOIN1', makeGuest('second-guest'))).rejects.toThrow();
  });
});

/* ─── roomExists / isRoomJoinable ────────────────────────────────── */

describe('roomService existence checks', () => {
  beforeEach(async () => {
    await roomService.createRoom({ roomCode: 'CHECK', hostPlayer: makeHost(), secretWord: 'ocean' });
  });

  test('roomExists returns true for existing room', () => {
    expect(roomService.roomExists('CHECK')).toBe(true);
  });

  test('roomExists returns false for unknown room', () => {
    expect(roomService.roomExists('ZZZZZ')).toBe(false);
  });

  test('isRoomJoinable returns true for an empty room', () => {
    expect(roomService.isRoomJoinable('CHECK')).toBe(true);
  });

  test('isRoomJoinable returns false after guest joins', async () => {
    await roomService.joinRoom('CHECK', makeGuest());
    expect(roomService.isRoomJoinable('CHECK')).toBe(false);
  });

  test('isRoomJoinable returns false for non-existent room', () => {
    expect(roomService.isRoomJoinable('ZZZZZ')).toBe(false);
  });
});

/* ─── updateRoom ─────────────────────────────────────────────────── */

describe('roomService.updateRoom', () => {
  test('merges updates into room and calls findOneAndUpdate', async () => {
    await roomService.createRoom({ roomCode: 'UPDT1', hostPlayer: makeHost(), secretWord: 'stone' });
    const updated = await roomService.updateRoom('UPDT1', { status: GAME_STATES.IN_PROGRESS });

    expect(updated.status).toBe(GAME_STATES.IN_PROGRESS);
    expect(Game.findOneAndUpdate).toHaveBeenCalledWith(
      { roomCode: 'UPDT1' },
      { $set: { status: GAME_STATES.IN_PROGRESS } },
      { new: true }
    );
  });

  test('returns null for non-existent room', async () => {
    const result = await roomService.updateRoom('ZZZZZ', { status: GAME_STATES.IN_PROGRESS });
    expect(result).toBeNull();
  });
});

/* ─── deleteRoom ─────────────────────────────────────────────────── */

describe('roomService.deleteRoom', () => {
  test('removes room from memory and calls Game.deleteOne', async () => {
    await roomService.createRoom({ roomCode: 'DELME', hostPlayer: makeHost(), secretWord: 'table' });
    await roomService.deleteRoom('DELME');

    expect(roomService.rooms.has('DELME')).toBe(false);
    expect(Game.deleteOne).toHaveBeenCalledWith({ roomCode: 'DELME' });
  });
});

/* ─── generateUniqueRoomCode ─────────────────────────────────────── */

describe('roomService.generateUniqueRoomCode', () => {
  test('returns a 5-character uppercase alphanumeric code', async () => {
    const code = await roomService.generateUniqueRoomCode();
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
  });

  test('checks MongoDB for collisions via Game.findOne', async () => {
    await roomService.generateUniqueRoomCode();
    expect(Game.findOne).toHaveBeenCalled();
  });
});

/* ─── cleanupExpiredRooms ────────────────────────────────────────── */

describe('roomService.cleanupExpiredRooms', () => {
  test('removes rooms older than expiration threshold', async () => {
    await roomService.createRoom({ roomCode: 'OLD01', hostPlayer: makeHost(), secretWord: 'magic' });
    // Backdate the room's creation time
    roomService.rooms.get('OLD01').createdAt = Date.now() - 999_999;

    await roomService.cleanupExpiredRooms(60_000); // 1-minute window

    expect(roomService.rooms.has('OLD01')).toBe(false);
    expect(Game.deleteMany).toHaveBeenCalledWith({ roomCode: { $in: ['OLD01'] } });
  });

  test('does not remove rooms within the expiration window', async () => {
    await roomService.createRoom({ roomCode: 'NEW01', hostPlayer: makeHost(), secretWord: 'pixel' });

    await roomService.cleanupExpiredRooms(60_000);

    expect(roomService.rooms.has('NEW01')).toBe(true);
    expect(Game.deleteMany).not.toHaveBeenCalled();
  });

  test('does nothing when no rooms exist', async () => {
    await roomService.cleanupExpiredRooms(60_000);
    expect(Game.deleteMany).not.toHaveBeenCalled();
  });
});
