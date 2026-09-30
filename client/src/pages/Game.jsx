import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import Board from '../components/Board';
import Keyboard from '../components/Keyboard';
import Toast from '../components/Toast';
import { useKeyboard } from '../hooks/useKeyboard';
import { GAME_STATES, ROLES } from '../utils/constants';

export default function Game() {
  const navigate = useNavigate();
  const { status, role, hostName, guestName, typeLetter, deleteLetter, submitGuess } = useGame();

  // Route protection / redirection
  useEffect(() => {
    if (!status) {
      navigate('/');
      return;
    }
    if ([GAME_STATES.GUEST_WON, GAME_STATES.GAME_OVER, GAME_STATES.PLAYER_DISCONNECTED].includes(status)) {
      navigate('/game-over');
    }
  }, [status, navigate]);

  const isGuest = role === ROLES.GUEST;
  const isHost = role === ROLES.HOST;

  // Bind physical keyboard (only active if it's the guest's turn)
  useKeyboard({
    onKey: typeLetter,
    onEnter: submitGuess,
    onDelete: deleteLetter,
    isActive: isGuest && status === GAME_STATES.IN_PROGRESS
  });

  if (!status) return null;

  return (
    <div className="page-container justify-between max-h-screen py-4 overflow-hidden">
      <Toast />
      
      {/* Header */}
      <div className="w-full flex justify-between items-center mb-6 max-w-lg mx-auto border-b border-gray-800 pb-4">
        <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest text-center w-1/2 border-r border-gray-800">
          <div className="text-[10px] mb-1">Host</div>
          <div className="text-white truncate px-2">{hostName}</div>
        </div>
        <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest text-center w-1/2">
          <div className="text-[10px] mb-1">Guest</div>
          <div className="text-wordle-green truncate px-2">{guestName}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center w-full min-h-0">
        <Board />
      </div>

      <div className="w-full mt-6 pb-2">
        {isHost ? (
          <div className="text-center text-gray-400 pb-8 px-4 max-w-sm mx-auto bg-wordle-surface p-4 rounded-xl border border-gray-800">
            <p className="mb-2 uppercase tracking-widest text-sm font-bold text-wordle-green">
              You are the host
            </p>
            <p className="text-sm">
              Watch as <strong className="text-white">{guestName}</strong> tries to guess your word.
            </p>
          </div>
        ) : (
          <Keyboard />
        )}
      </div>
    </div>
  );
}
