import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { GAME_STATES, ROLES, CONNECTION_STATUS, MAX_ATTEMPTS, WORD_LENGTH } from '../utils/constants';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

/* ── Context ─────────────────────────────────────────────────────────────── */
const GameContext = createContext(null);

/* ── Initial state ───────────────────────────────────────────────────────── */
const initialState = {
  connectionStatus: CONNECTION_STATUS.DISCONNECTED,

  // Player identity (persisted in sessionStorage to survive refreshes)
  playerId:  sessionStorage.getItem('wPlayerId')  || null,
  role:      sessionStorage.getItem('wRole')      || null,
  roomCode:  sessionStorage.getItem('wRoomCode')  || null,

  // Room
  joinUrl:   '',
  status:    null,

  // Players
  hostName:  '',
  guestName: '',

  // Game board
  guesses:       [],   // Completed guesses: [{ word, result[], attempt }]
  hostGuessView: [],   // Host-side view: [{ result[], attempt }] — NO words
  currentAttempt: 0,
  maxAttempts:    MAX_ATTEMPTS,
  currentGuess:  '',   // Guest's in-progress word (not yet submitted)

  // Outcome
  winner:     null,
  secretWord: null,    // Only populated after game ends

  // UI state
  error:     null,
  toast:     null,     // { message: string, type: 'success'|'error'|'info' }
  isLoading: false,
  shakeRow:  false,    // Triggers shake animation on invalid guess row
};

/* ── Reducer ─────────────────────────────────────────────────────────────── */
function gameReducer(state, action) {
  switch (action.type) {

    case 'SET_CONNECTION': return { ...state, connectionStatus: action.payload };

    case 'GAME_CREATED':
      return {
        ...state,
        playerId:  action.payload.playerId,
        roomCode:  action.payload.roomCode,
        joinUrl:   action.payload.joinUrl,
        hostName:  action.payload.hostName,
        role:      ROLES.HOST,
        status:    GAME_STATES.WAITING_FOR_PLAYER,
        isLoading: false,
        error:     null,
        // Reset board from any previous game
        guesses: [], hostGuessView: [], currentAttempt: 0,
        currentGuess: '', winner: null, secretWord: null,
      };

    case 'GAME_JOINED':
      return {
        ...state,
        playerId:  action.payload.playerId,
        roomCode:  action.payload.roomCode,
        hostName:  action.payload.hostName,
        guestName: action.payload.guestName,
        role:      ROLES.GUEST,
        status:    GAME_STATES.PLAYER_JOINED,
        isLoading: false,
        error:     null,
        guesses: [], hostGuessView: [], currentAttempt: 0,
        currentGuess: '', winner: null, secretWord: null,
      };

    case 'PLAYER_JOINED':
      return {
        ...state,
        guestName: action.payload.guestName,
        status:    GAME_STATES.READY_TO_START,
      };

    case 'GAME_STARTED':
      return {
        ...state,
        status:      GAME_STATES.IN_PROGRESS,
        maxAttempts: action.payload.maxAttempts || MAX_ATTEMPTS,
        hostName:    action.payload.hostName || state.hostName,
        guestName:   action.payload.guestName || state.guestName,
        guesses:     [],
        hostGuessView: [],
        currentAttempt: 0,
        currentGuess: '',
        error: null,
      };

    case 'GUESS_RESULT':
      return {
        ...state,
        guesses: [
          ...state.guesses,
          { word: action.payload.guess, result: action.payload.result, attempt: action.payload.attempt },
        ],
        currentAttempt: action.payload.attempt,
        currentGuess:   '',
        shakeRow:       false,
        status:         action.payload.status,
        secretWord:     action.payload.secretWord ?? state.secretWord,
      };

    case 'GUESS_UPDATE':
      return {
        ...state,
        hostGuessView: [
          ...state.hostGuessView,
          { result: action.payload.result, attempt: action.payload.attempt },
        ],
        currentAttempt: action.payload.attempt,
        status:         action.payload.status,
        secretWord:     action.payload.secretWord ?? state.secretWord,
      };

    case 'GAME_WON':
      return {
        ...state,
        status:     GAME_STATES.GUEST_WON,
        winner:     action.payload.winner,
        secretWord: action.payload.secretWord,
        currentGuess: '',
      };

    case 'GAME_LOST':
      return {
        ...state,
        status:     GAME_STATES.GAME_OVER,
        secretWord: action.payload.secretWord,
        currentGuess: '',
      };

    case 'PLAYER_DISCONNECTED':
      return {
        ...state,
        toast: { message: action.payload.message, type: 'error' },
      };

    case 'PLAYER_LEFT':
      return {
        ...state,
        status:     GAME_STATES.PLAYER_DISCONNECTED,
        secretWord: action.payload.secretWord ?? state.secretWord,
        toast:      { message: action.payload.message, type: 'error' },
      };

    case 'RECONNECTED':
      return {
        ...state,
        ...action.payload.roomState,
        role:  action.payload.role,
        toast: { message: 'Reconnected!', type: 'success' },
      };

    case 'PLAYER_RECONNECTED':
      return {
        ...state,
        toast: { message: `${action.payload.playerName} reconnected!`, type: 'success' },
      };

    case 'TYPE_LETTER':
      if (state.currentGuess.length >= WORD_LENGTH) return state;
      return { ...state, currentGuess: state.currentGuess + action.payload, shakeRow: false };

    case 'DELETE_LETTER':
      return { ...state, currentGuess: state.currentGuess.slice(0, -1) };

    case 'SHAKE_ROW': return { ...state, shakeRow: true };
    case 'CLEAR_SHAKE': return { ...state, shakeRow: false };

    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_ERROR':   return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR': return { ...state, error: null };
    case 'SET_TOAST':   return { ...state, toast: action.payload };
    case 'CLEAR_TOAST': return { ...state, toast: null };

    case 'RESET_GAME':
      return { ...initialState, connectionStatus: state.connectionStatus };

    default:
      return state;
  }
}

/* ── Provider ────────────────────────────────────────────────────────────── */
export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const socketRef  = useRef(null);
  const navigate   = useNavigate();

  // ── Mutable refs so socket event closures always see latest values ────────
  // (avoids stale closure problem with useEffect(()=>{}, []) )
  const roomCodeRef  = useRef(state.roomCode);
  const playerIdRef  = useRef(state.playerId);
  const statusRef    = useRef(state.status);

  roomCodeRef.current = state.roomCode;
  playerIdRef.current = state.playerId;
  statusRef.current   = state.status;

  // ── Persist identity to sessionStorage on change ──────────────────────────
  useEffect(() => {
    if (state.playerId) sessionStorage.setItem('wPlayerId', state.playerId);
    if (state.roomCode) sessionStorage.setItem('wRoomCode', state.roomCode);
    if (state.role)     sessionStorage.setItem('wRole',     state.role);
  }, [state.playerId, state.roomCode, state.role]);

  // ── Socket lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // ── Connection events ─────────────────────────────────────────────────
    socket.on('connect', () => {
      dispatch({ type: 'SET_CONNECTION', payload: CONNECTION_STATUS.CONNECTED });

      // Auto-reconnect: if the player has stored credentials and the game was
      // in progress, attempt to rejoin transparently after a page refresh.
      const storedPlayerId = sessionStorage.getItem('wPlayerId');
      const storedRoomCode = sessionStorage.getItem('wRoomCode');
      if (storedPlayerId && storedRoomCode && !statusRef.current) {
        socket.emit('reconnectPlayer', {
          roomCode: storedRoomCode,
          playerId: storedPlayerId,
        });
      }
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'SET_CONNECTION', payload: CONNECTION_STATUS.DISCONNECTED });
    });

    socket.on('connect_error', () => {
      dispatch({ type: 'SET_CONNECTION', payload: CONNECTION_STATUS.DISCONNECTED });
    });

    socket.io.on('reconnect_attempt', () => {
      dispatch({ type: 'SET_CONNECTION', payload: CONNECTION_STATUS.RECONNECTING });
    });

    socket.io.on('reconnect', () => {
      dispatch({ type: 'SET_CONNECTION', payload: CONNECTION_STATUS.CONNECTED });
    });

    // ── Game events ───────────────────────────────────────────────────────

    // Host created a game → navigate to lobby
    socket.on('gameCreated', (data) => {
      sessionStorage.setItem('wPlayerId', data.playerId);
      sessionStorage.setItem('wRoomCode', data.roomCode);
      sessionStorage.setItem('wRole',     ROLES.HOST);
      dispatch({ type: 'GAME_CREATED', payload: data });
      navigate(`/lobby/${data.roomCode}`);
    });

    // Guest joined a game → navigate to lobby to wait
    socket.on('gameJoined', (data) => {
      sessionStorage.setItem('wPlayerId', data.playerId);
      sessionStorage.setItem('wRoomCode', data.roomCode);
      sessionStorage.setItem('wRole',     ROLES.GUEST);
      dispatch({ type: 'GAME_JOINED', payload: data });
      navigate(`/lobby/${data.roomCode}`);
    });

    // Host receives this when a guest joins
    socket.on('playerJoined', (data) => {
      dispatch({ type: 'PLAYER_JOINED', payload: data });
    });

    // Both players receive this when the host clicks Start
    socket.on('gameStarted', (data) => {
      dispatch({ type: 'GAME_STARTED', payload: data });
      // Use ref so this closure always has the latest roomCode
      navigate(`/game/${roomCodeRef.current}`);
    });

    // Guest receives their scored result after submitting a guess
    socket.on('guessResult', (data) => {
      dispatch({ type: 'GUESS_RESULT', payload: data });
    });

    // Host receives tile-colour-only update (no secret word mid-game)
    socket.on('guessUpdate', (data) => {
      dispatch({ type: 'GUESS_UPDATE', payload: data });
    });

    // Guest guessed correctly — both players notified
    socket.on('gameWon', (data) => {
      dispatch({ type: 'GAME_WON', payload: data });
      setTimeout(() => navigate('/game-over'), 1500);
    });

    // Guest used all attempts — both players notified
    socket.on('gameLost', (data) => {
      dispatch({ type: 'GAME_LOST', payload: data });
      setTimeout(() => navigate('/game-over'), 1500);
    });

    // Temporary disconnection (within grace period) — show toast, don't end game
    socket.on('playerDisconnected', (data) => {
      dispatch({ type: 'PLAYER_DISCONNECTED', payload: data });
    });

    // Permanent disconnect (grace period expired) — reveal word, navigate away
    socket.on('playerLeft', (data) => {
      dispatch({ type: 'PLAYER_LEFT', payload: data });
      setTimeout(() => navigate('/game-over'), 2000);
    });

    // This socket reconnected to an existing room
    socket.on('reconnected', (data) => {
      dispatch({ type: 'RECONNECTED', payload: data });
      // Navigate back to the appropriate screen based on restored status
      const restoredStatus = data.roomState?.status;
      if (restoredStatus === GAME_STATES.IN_PROGRESS) {
        navigate(`/game/${data.roomState.roomCode}`);
      } else if (
        restoredStatus === GAME_STATES.WAITING_FOR_PLAYER ||
        restoredStatus === GAME_STATES.READY_TO_START
      ) {
        navigate(`/lobby/${data.roomState.roomCode}`);
      }
    });

    // The OTHER player reconnected — show a toast
    socket.on('playerReconnected', (data) => {
      dispatch({ type: 'PLAYER_RECONNECTED', payload: data });
    });

    // Server-side validation / auth error
    socket.on('error', (data) => {
      dispatch({ type: 'SET_ERROR', payload: data.message });
      dispatch({ type: 'SET_LOADING', payload: false });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('gameCreated');
      socket.off('gameJoined');
      socket.off('playerJoined');
      socket.off('gameStarted');
      socket.off('guessResult');
      socket.off('guessUpdate');
      socket.off('gameWon');
      socket.off('gameLost');
      socket.off('playerDisconnected');
      socket.off('playerLeft');
      socket.off('reconnected');
      socket.off('playerReconnected');
      socket.off('error');
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Create socket once on mount

  // ── Actions ───────────────────────────────────────────────────────────────

  const createGame = useCallback(({ playerName, secretWord }) => {
    if (!socketRef.current?.connected) {
      dispatch({ type: 'SET_ERROR', payload: 'Not connected to server. Please refresh the page.' });
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });
    socketRef.current.emit('createGame', { playerName, secretWord });
  }, []);

  const joinGame = useCallback(({ roomCode, playerName }) => {
    if (!socketRef.current?.connected) {
      dispatch({ type: 'SET_ERROR', payload: 'Not connected to server. Please refresh the page.' });
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });
    socketRef.current.emit('joinGame', { roomCode: roomCode.toUpperCase(), playerName });
  }, []);

  const startGame = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('startGame', {
      roomCode: roomCodeRef.current,
      playerId: playerIdRef.current,
    });
  }, []);

  const submitGuess = useCallback(() => {
    if (!socketRef.current?.connected) return;
    if (state.currentGuess.length !== WORD_LENGTH) {
      dispatch({ type: 'SET_TOAST', payload: { message: `Word must be ${WORD_LENGTH} letters`, type: 'error' } });
      dispatch({ type: 'SHAKE_ROW' });
      setTimeout(() => dispatch({ type: 'CLEAR_SHAKE' }), 600);
      return;
    }
    socketRef.current.emit('submitGuess', {
      roomCode: roomCodeRef.current,
      playerId: playerIdRef.current,
      guess:    state.currentGuess.toLowerCase(),
    });
  }, [state.currentGuess]);

  const typeLetter = useCallback((letter) => {
    dispatch({ type: 'TYPE_LETTER', payload: letter.toUpperCase() });
  }, []);

  const deleteLetter = useCallback(() => {
    dispatch({ type: 'DELETE_LETTER' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const setToast = useCallback((message, type = 'info') => {
    dispatch({ type: 'SET_TOAST', payload: { message, type } });
  }, []);

  const clearToast = useCallback(() => {
    dispatch({ type: 'CLEAR_TOAST' });
  }, []);

  const resetGame = useCallback(() => {
    sessionStorage.removeItem('wPlayerId');
    sessionStorage.removeItem('wRoomCode');
    sessionStorage.removeItem('wRole');
    dispatch({ type: 'RESET_GAME' });
    navigate('/');
  }, [navigate]);

  /* ── Context value ─────────────────────────────────────────────────────── */
  const value = {
    // State (spread)
    ...state,
    // Raw socket (for components that need direct access)
    socket: socketRef.current,
    // Actions
    createGame,
    joinGame,
    startGame,
    submitGuess,
    typeLetter,
    deleteLetter,
    clearError,
    setToast,
    clearToast,
    resetGame,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/**
 * Hook to access the game context.
 * Must be used inside a <GameProvider>.
 */
export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a <GameProvider>');
  return ctx;
}

export default GameContext;
