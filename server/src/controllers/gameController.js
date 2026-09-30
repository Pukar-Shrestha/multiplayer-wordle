const roomService = require('../services/roomService');
const { GAME_STATES } = require('../config/constants');

/**
 * GET /api/health
 * Simple liveness check used by deployment platforms.
 */
function health(req, res) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
}

/**
 * GET /api/room/:code/exists
 *
 * Allows the frontend to pre-validate a room code before connecting
 * via Socket.IO. Returns safe metadata — never includes secretWord.
 *
 * Possible responses:
 *   { exists: false }                              → room not found
 *   { exists: true, joinable: false, reason }      → full / started / ended
 *   { exists: true, joinable: true, hostName }     → open for joining
 */
function roomExists(req, res) {
  const code = (req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

  if (!code || code.length !== 5) {
    return res.status(400).json({ error: 'Invalid room code format' });
  }

  const room = roomService.getRoom(code);

  if (!room) {
    return res.json({ exists: false });
  }

  const joinable = roomService.isRoomJoinable(code);

  if (!joinable) {
    let reason = 'This game has already started';
    if (room.guest) reason = 'This game is already full';
    if (room.status === GAME_STATES.PLAYER_DISCONNECTED) reason = 'This game has ended';
    if ([GAME_STATES.GUEST_WON, GAME_STATES.GAME_OVER].includes(room.status)) {
      reason = 'This game has already finished';
    }
    return res.json({ exists: true, joinable: false, reason });
  }

  return res.json({
    exists: true,
    joinable: true,
    hostName: room.host.name,
  });
}

module.exports = { health, roomExists };
