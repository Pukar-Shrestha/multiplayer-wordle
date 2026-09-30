import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import { Suspense, lazy } from 'react';

// Lazy-load pages for better initial load performance
const Home     = lazy(() => import('./pages/Home'));
const CreateGame = lazy(() => import('./pages/CreateGame'));
const JoinGame = lazy(() => import('./pages/JoinGame'));
const Lobby    = lazy(() => import('./pages/Lobby'));
const Game     = lazy(() => import('./pages/Game'));
const GameOver = lazy(() => import('./pages/GameOver'));

// Simple full-screen loader for lazy-loaded pages
function PageLoader() {
  return (
    <div className="min-h-screen bg-wordle-dark flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-wordle-green border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/*
        GameProvider MUST be inside BrowserRouter so it can call useNavigate().
        It creates the Socket.IO connection and owns all game state.
      */}
      <GameProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Home — choose Create or Join */}
            <Route path="/" element={<Home />} />

            {/* Host flow */}
            <Route path="/create" element={<CreateGame />} />
            <Route path="/lobby/:roomCode" element={<Lobby />} />

            {/* Guest flow — /join shows a code input; /join/:roomCode pre-fills it */}
            <Route path="/join" element={<JoinGame />} />
            <Route path="/join/:roomCode" element={<JoinGame />} />

            {/* Active game */}
            <Route path="/game/:roomCode" element={<Game />} />

            {/* Result screen (both players end up here) */}
            <Route path="/game-over" element={<GameOver />} />

            {/* Catch-all → home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </GameProvider>
    </BrowserRouter>
  );
}
