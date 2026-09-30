const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const gameRoutes = require('./routes/gameRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

/* ─── Security headers ───────────────────────────────────────────── */
app.use(helmet());

/* ─── CORS ───────────────────────────────────────────────────────── */
// In production, restrict origin to the deployed frontend URL.
// Never use origin: '*' in production — it would allow any site to
// make cross-origin requests to this API/WS server.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin header) in development
      if (!origin && process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

/* ─── Body parsing ───────────────────────────────────────────────── */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

/* ─── Routes ─────────────────────────────────────────────────────── */
app.use('/api', gameRoutes);

/* ─── 404 handler ────────────────────────────────────────────────── */
app.use(notFoundHandler);

/* ─── Error handler (must be last) ──────────────────────────────── */
app.use(errorHandler);

module.exports = app;
