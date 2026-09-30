import { useGame } from '../context/GameContext';

/**
 * Convenience hook — exposes the raw Socket.IO socket and connection status
 * from the global GameContext without having to destructure the full context.
 *
 * Use this when a component only needs the socket or connection status,
 * not the full game state.
 *
 * @returns {{ socket: import('socket.io-client').Socket|null, connectionStatus: string }}
 */
export function useSocket() {
  const { socket, connectionStatus } = useGame();
  return { socket, connectionStatus };
}
