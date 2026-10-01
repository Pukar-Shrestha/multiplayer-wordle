require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const connectDB = require('./config/db');
const registerGameSocket = require('./sockets/gameSocket');
const { cleanupExpiredRooms } = require('./services/roomService');
const { CLEANUP_INTERVAL_MS } = require('./config/constants');

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const ROOM_EXPIRATION_MS =
  parseInt(process.env.ROOM_EXPIRATION_MINUTES || '60', 10) * 60 * 1000;

/* ─── HTTP server ────────────────────────────────────────────────── */
const server = http.createServer(app);

/* ─── Socket.IO server ───────────────────────────────────────────── */
// CORS must match the Express CORS config — same origin whitelist.
const allowedOrigins = CLIENT_URL.split(',').map((o) => o.trim());

const io = new Server(server, {
  cors: {
    // If '*' is provided, reflect the incoming origin to allow credentials.
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Prefer WebSocket transport; fall back to polling for environments
  // (e.g. some proxies) that don't support WebSocket upgrades.
  transports: ['websocket', 'polling'],
  // Ping settings — keep connections alive without excessive overhead
  pingTimeout: 60000,  // 60s before considering a client gone
  pingInterval: 25000, // send a ping every 25s
});

/* ─── Register all Socket.IO event handlers ──────────────────────── */
io.on('connection', (socket) => {
  registerGameSocket(io, socket);
});

/* ─── Periodic room cleanup ──────────────────────────────────────── */
// Scans in-memory rooms every CLEANUP_INTERVAL_MS and removes any that
// have exceeded ROOM_EXPIRATION_MS. MongoDB TTL index is a secondary
// safety net for documents that survive server restarts.
const cleanupInterval = setInterval(async () => {
  try {
    await cleanupExpiredRooms(ROOM_EXPIRATION_MS);
  } catch (err) {
    console.error('Room cleanup error:', err.message);
  }
}, CLEANUP_INTERVAL_MS);

// Don't prevent the process from exiting cleanly
cleanupInterval.unref();

/* ─── Start server ───────────────────────────────────────────────── */
async function start() {
  // Connect to MongoDB before accepting any connections
  await connectDB();

  server.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Allowed origin(s): ${allowedOrigins.join(', ')}`);
    console.log(`   Room expiry : ${process.env.ROOM_EXPIRATION_MINUTES || 60} minutes`);
    console.log(`   Socket.IO ready\n`);
  });
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

/* ─── Graceful shutdown ──────────────────────────────────────────── */
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(cleanupInterval);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // Force exit if close hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { server, io }; // exported for integration tests
