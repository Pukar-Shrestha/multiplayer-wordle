import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';

export default function CreateGame() {
  const navigate = useNavigate();
  const { createGame, isLoading, error, clearError } = useGame();
  
  const [name, setName] = useState('');
  const [word, setWord] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    createGame({ playerName: name, secretWord: word });
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
          <p className="text-xs text-gray-500 mt-2">
            The word must be a valid English 5-letter word.
          </p>
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
