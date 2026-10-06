import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import Board from '../components/Board';
import Keyboard from '../components/Keyboard';
import Toast from '../components/Toast';
import { useKeyboard } from '../hooks/useKeyboard';
import { GAME_STATES, ROLES } from '../utils/constants';

export default function Game() {
  const navigate = useNavigate();
  const { 
    status, role, hostName, guests, settings, hostGuessView,
    guesses, currentGuess, shakeRow, startedAt,
    typeLetter, deleteLetter, submitGuess, handleTimeUp, handleStopGame
  } = useGame();

  const [timeLeft, setTimeLeft] = useState((settings?.timerMinutes || 5) * 60);

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

  // Timer logic based on server startedAt time
  useEffect(() => {
    if (status !== GAME_STATES.IN_PROGRESS || !startedAt) return;

    const totalDurationSeconds = (settings?.timerMinutes || 5) * 60;
    let hasNotifiedTimeUp = false;

    const tick = () => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = totalDurationSeconds - elapsedSeconds;
      
      if (remaining <= 0) {
        setTimeLeft(0);
        if (isHost && !hasNotifiedTimeUp) {
          hasNotifiedTimeUp = true;
          handleTimeUp();
        }
        return false; // return false to stop timer
      }
      setTimeLeft(remaining);
      return true;
    };

    // Initial tick
    tick();

    const timer = setInterval(() => {
      if (!tick()) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [status, startedAt, settings, isHost, handleTimeUp]);

  // Bind physical keyboard (only active if it's the guest's turn)
  useKeyboard({
    onKey: typeLetter,
    onEnter: submitGuess,
    onDelete: deleteLetter,
    isActive: isGuest && status === GAME_STATES.IN_PROGRESS && timeLeft > 0
  });

  if (!status) return null;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="page-container justify-between max-h-screen py-4 overflow-hidden">
      <Toast />
      
      {/* Header */}
      <div className="w-full flex justify-between items-center mb-6 max-w-4xl mx-auto border-b border-gray-800 pb-4 px-4">
        <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
          Host: <span className="text-white">{hostName}</span>
        </div>
        <div className="text-xl font-bold text-wordle-green">
          {formatTime(timeLeft)}
        </div>
        <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
          {isHost ? 'Observing' : 'Playing'}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center w-full min-h-0 overflow-y-auto">
        {isHost ? (
          <div className="flex flex-wrap justify-center gap-8 w-full max-w-5xl px-4">
            {guests.map((guest, i) => {
              const guestGuesses = hostGuessView.filter(g => g.playerId === guest.playerId);
              return (
                <div key={i} className="flex flex-col items-center">
                  <h3 className="mb-2 font-bold text-wordle-green">{guest.name}</h3>
                  <Board 
                    guesses={guestGuesses} 
                    currentGuess="" 
                    isHostView={true} 
                    status={status} 
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <Board 
            guesses={guesses} 
            currentGuess={currentGuess} 
            shakeRow={shakeRow} 
            status={status} 
          />
        )}
      </div>

      <div className="w-full mt-6 pb-2">
        {isHost ? (
          <div className="text-center text-gray-400 pb-8 px-4 max-w-sm mx-auto bg-wordle-surface p-4 rounded-xl border border-gray-800">
            <p className="mb-2 uppercase tracking-widest text-sm font-bold text-wordle-green">
              You are the host
            </p>
            <p className="text-sm mb-4">
              Watch the guests race to guess your word!
            </p>
            <button 
              onClick={() => handleStopGame()}
              className="bg-[#2a2a2c] hover:bg-red-900/80 border border-red-900/50 text-red-400 hover:text-red-300 font-bold py-2.5 px-4 rounded-xl transition-colors w-full uppercase tracking-widest text-sm"
            >
              Stop Game
            </button>
          </div>
        ) : (
          <Keyboard />
        )}
      </div>
    </div>
  );
}
