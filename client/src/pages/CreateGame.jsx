import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGame } from '../context/GameContext';

export default function CreateGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { createGame, isLoading, error, clearError } = useGame();
  
  const [name, setName] = useState(localStorage.getItem('wPlayerName') || '');
  const [word, setWord] = useState('');
  const [maxGuests, setMaxGuests] = useState(5);
  const [timerMinutes, setTimerMinutes] = useState(5);

  const handleSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem('wPlayerName', name);
    createGame({ 
      playerName: name, 
      secretWord: word, 
      maxGuests: Number(maxGuests), 
      timerMinutes: Number(timerMinutes),
      oldRoomCode: location.state?.oldRoomCode
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
        
        <div>
          <label className="block text-sm text-gray-400 mb-2">Secret Word</label>
          <input 
            type="text" 
            className="game-input uppercase" 
            placeholder="5 letters"
            value={word} 
            onChange={e => { setWord(e.target.value.replace(/[^A-Za-z]/g, '')); clearError(); }} 
            maxLength={5} 
            minLength={5} 
            required 
          />
          <p className="text-xs text-gray-500 mt-2 mb-4">
            The word must be a valid English 5-letter word.
          </p>
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
            disabled={isLoading || word.length !== 5 || !name.trim()}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
