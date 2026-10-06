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

  const handleDecreaseGuests = () => setMaxGuests(prev => Math.max(1, prev - 1));
  const handleIncreaseGuests = () => setMaxGuests(prev => Math.min(5, prev + 1));

  // Determine if the form is valid
  const isFormValid = !isLoading && (isRandomWord || word.length === 5) && name.trim().length > 0;

  return (
    <div className="page-container justify-center pt-8">
      <form 
        className="w-full max-w-lg bg-[#1a1a1b] rounded-2xl p-6 sm:p-8 space-y-6 text-white" 
        onSubmit={handleSubmit}
      >
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm font-semibold">
            {error}
          </div>
        )}
        
        {/* Your name */}
        <div>
          <label className="block text-sm font-bold mb-2">Your name</label>
          <input 
            type="text" 
            className="w-full bg-[#121213] border border-[#3a3a3c] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gray-400 transition-colors"
            placeholder="Kimbao"
            value={name} 
            onChange={e => { setName(e.target.value); clearError(); }} 
            maxLength={20} 
            required 
          />
        </div>
        
        {/* Secret word */}
        <div>
          <label className="block text-sm font-bold mb-2">Secret word</label>
          <div className="flex space-x-3">
            <input 
              type="text" 
              disabled={isRandomWord}
              className={`flex-1 bg-[#121213] border border-[#3a3a3c] rounded-xl px-4 py-3 text-white uppercase tracking-[0.4em] font-bold focus:outline-none focus:border-gray-400 transition-colors ${isRandomWord ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="5 LETTERS"
              value={isRandomWord ? 'RANDOM' : word} 
              onChange={e => { setWord(e.target.value.replace(/[^A-Za-z]/g, '')); clearError(); }} 
              maxLength={5} 
              minLength={5} 
              required={!isRandomWord}
            />
            <button 
              type="button"
              onClick={() => { setIsRandomWord(!isRandomWord); clearError(); }}
              className={`px-6 rounded-xl font-bold border transition-colors ${
                isRandomWord 
                  ? 'bg-white text-black border-white' 
                  : 'bg-[#1a1a1b] text-white border-[#3a3a3c] hover:bg-[#2a2a2c]'
              }`}
            >
              Random
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {isRandomWord ? "A random word will be chosen for you." : "Must be a valid English word."}
          </p>
        </div>

        {/* Guests and Timer Row */}
        <div className="grid grid-cols-2 gap-6 pt-2">
          {/* Guests */}
          <div>
            <label className="block text-sm font-bold mb-2">Guests</label>
            <div className="flex items-center justify-between bg-[#121213] border border-[#3a3a3c] rounded-xl p-1.5 h-[52px]">
              <button 
                type="button"
                onClick={handleDecreaseGuests}
                className="w-10 h-10 flex items-center justify-center bg-[#1a1a1b] hover:bg-[#2a2a2c] rounded-lg text-white transition-colors disabled:opacity-50"
                disabled={maxGuests <= 1}
              >
                −
              </button>
              <span className="font-bold text-lg">{maxGuests}</span>
              <button 
                type="button"
                onClick={handleIncreaseGuests}
                className="w-10 h-10 flex items-center justify-center bg-[#1a1a1b] hover:bg-[#2a2a2c] rounded-lg text-white transition-colors disabled:opacity-50"
                disabled={maxGuests >= 5}
              >
                +
              </button>
            </div>
          </div>

          {/* Timer */}
          <div>
            <label className="block text-sm font-bold mb-2">Timer</label>
            <div className="flex items-center bg-[#121213] border border-[#3a3a3c] rounded-xl p-1.5 h-[52px]">
              {[3, 5, 10].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setTimerMinutes(mins)}
                  className={`flex-1 h-full flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
                    timerMinutes === mins 
                      ? 'bg-white text-black' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2a2a2c]'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Bottom Actions */}
        <div className="flex gap-4 pt-6">
          <button 
            type="button" 
            className="flex-shrink-0 px-8 py-4 rounded-xl font-bold bg-[#1a1a1b] border border-[#3a3a3c] text-white hover:bg-[#2a2a2c] transition-colors"
            onClick={() => navigate('/')}
          >
            Back
          </button>
          <button 
            type="submit" 
            disabled={!isFormValid}
            className={`flex-1 py-4 rounded-xl font-bold transition-all ${
              isFormValid 
                ? 'bg-wordle-green text-white hover:opacity-90 active:scale-[0.98]' 
                : 'bg-[#565758] text-[#121213] cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Creating...' : 'Create room'}
          </button>
        </div>
      </form>
    </div>
  );
}
