import axios from 'axios';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${SERVER_URL}/api`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — add auth headers here if ever needed ────────────
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// ── Response interceptor — normalise error messages ───────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.message ||
      'Network error. Please check your connection.';
    return Promise.reject(new Error(message));
  }
);

/* ── API functions ─────────────────────────────────────────────────────── */

/**
 * Check if a room exists before the guest attempts a Socket.IO join.
 * Returns safe metadata — never includes the secret word.
 *
 * @param {string} roomCode
 * @returns {Promise<{ exists: boolean, joinable?: boolean, hostName?: string, reason?: string }>}
 */
export async function checkRoomExists(roomCode) {
  const { data } = await api.get(`/room/${encodeURIComponent(roomCode)}/exists`);
  return data;
}

/**
 * Ping the server health endpoint.
 * @returns {Promise<{ status: string, uptime: number }>}
 */
export async function getHealth() {
  const { data } = await api.get('/health');
  return data;
}

export default api;
