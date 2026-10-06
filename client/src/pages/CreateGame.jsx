import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGame } from '../context/GameContext';

export default function CreateGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { createGame, isLoading, error, clearError } = useGame();
  
  const [name, setName] = useState(localStorage.getItem('wPlayerName') || '');
  const [word, setWord] = useState('');
  const [isRandomWord, setIsRandomWord] = useState(false);
  const [maxGuests, setMaxGuests] = useState(5);
  const [timerMinutes, setTimerMinutes] = useState(5);

  const handleSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem('wPlayerName', name);
    createGame({ 
      playerName: name, 
      secretWord: isRandomWord ? '' : word, 
      maxGuests: Number(maxGuests), 
      timerMinutes: Number(timerMinutes),
      oldRoomCode: location.state?.oldRoomCode,
      isRandomWord
    });
  };

  return (
    <div className="page-container pt-12">
      <h1 className="text-3xl font-bold mb-8">Host a Game</h1>
      
      <form className="card space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm font-semibold">
            {error}
          </div>
        )}
        
        <div>
          <label className="block text-sm text-gray-400 mb-2">Your Name</label>
          <input 
            type="text" 
            className="game-input" 
            placeholder="e.g. Alex"
            value={name} 
            onChange={e => { setName(e.target.value); clearError(); }} 
            maxLength={20} 
            required 
          />
        </div>
        
        <div className="space-y-3 border border-gray-700 p-4 rounded-xl bg-wordle-surface">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-bold text-white">Secret Word</label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isRandomWord}
                onChange={(e) => { setIsRandomWord(e.target.checked); clearError(); }}
                className="w-4 h-4 accent-wordle-green cursor-pointer"
              />
              <span className="text-sm text-gray-300">Random Word</span>
            </label>
          </div>
          
          {!isRandomWord && (
            <>
              <input 
                type="text" 
                className="game-input uppercase" 
                placeholder="5 letters"
                value={word} 
                onChange={e => { setWord(e.target.value.replace(/[^A-Za-z]/g, '')); clearError(); }} 
                maxLength={5} 
                minLength={5} 
                required={!isRandomWord}
              />
              <p className="text-xs text-gray-500 mt-2 mb-4">
                The word must be a valid English 5-letter word.
              </p>
            </>
          )}
          {isRandomWord && (
            <div className="p-3 bg-gray-800 rounded text-center text-sm text-gray-400 italic">
              A random 5-letter word will be chosen. Even you won't know it!
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Max Players</label>
            <select 
              className="game-input bg-wordle-dark text-white cursor-pointer"
              value={maxGuests}
              onChange={(e) => setMaxGuests(e.target.value)}
            >
              {[1, 2, 3, 4, 5].map(num => (
                <option key={num} value={num}>{num} {num === 1 ? 'Guest' : 'Guests'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Timer</label>
            <select 
              className="game-input bg-wordle-dark text-white cursor-pointer"
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(e.target.value)}
            >
              {[1, 2, 3, 4, 5].map(num => (
                <option key={num} value={num}>{num} {num === 1 ? 'Minute' : 'Minutes'}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="pt-2 flex gap-4">
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => navigate('/')}
          >
            Back
          </button>
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isLoading || (!isRandomWord && word.length !== 5) || !name.trim()}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
