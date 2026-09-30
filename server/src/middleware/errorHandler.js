/**
 * Central Express error handler.
 * Must be registered LAST (after all routes) via app.use(errorHandler).
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Log the full error server-side
  console.error('❌ Error:', err.message);
  if (isDev) console.error(err.stack);

  // Never expose internal stack traces to clients
  const status = err.status || err.statusCode || 500;
  const message =
    status < 500
      ? err.message
      : 'An internal server error occurred. Please try again.';

  res.status(status).json({ error: message });
}

/**
 * 404 handler — register BEFORE errorHandler, AFTER all routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFoundHandler };
