import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { checkRoomExists } from '../services/api';

export default function JoinGame() {
  const navigate = useNavigate();
  const { roomCode: urlCode } = useParams();
  const { joinGame, isLoading, error, clearError, setToast } = useGame();
  
  const [name, setName] = useState(localStorage.getItem('wPlayerName') || '');
  const [code, setCode] = useState(urlCode || '');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (urlCode) setCode(urlCode);
  }, [urlCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    localStorage.setItem('wPlayerName', name);
    const formattedCode = code.trim().toUpperCase();
    
    // Fast pre-flight check before opening Socket.IO connection
    setIsChecking(true);
    try {
      const roomMeta = await checkRoomExists(formattedCode);
      if (!roomMeta.exists) {
        setToast('Room not found. Check the code.', 'error');
        setIsChecking(false);
        return;
      }
      if (!roomMeta.joinable) {
        setToast(roomMeta.reason || 'Cannot join room.', 'error');
        setIsChecking(false);
        return;
      }
    } catch (err) {
      setToast('Network error verifying room.', 'error');
      setIsChecking(false);
      return;
    }
    
    setIsChecking(false);
    joinGame({ roomCode: formattedCode, playerName: name });
  };

  return (
    <div className="page-container justify-center pt-8">
      <form 
        className="w-full max-w-lg bg-[#1a1a1b] rounded-2xl p-6 sm:p-8 space-y-6 text-white" 
        onSubmit={handleSubmit}
      >
        <h1 className="text-3xl font-bold mb-2">Join Game</h1>
        
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm font-semibold">
            {error}
          </div>
        )}
        
        <div>
          <label className="block text-sm font-bold mb-2">Room Code</label>
          <input 
            type="text" 
            className="w-full bg-[#121213] border border-[#3a3a3c] rounded-xl px-4 py-3 text-white uppercase tracking-[0.2em] font-bold focus:outline-none focus:border-gray-400 transition-colors"
            placeholder="5 chars (e.g. A1B2C)"
            value={code} 
            onChange={e => { setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '')); clearError(); }} 
            maxLength={5} 
            required 
            readOnly={!!urlCode}
          />
        </div>
        
        <div>
          <label className="block text-sm font-bold mb-2">Your Name</label>
          <input 
            type="text" 
            className="w-full bg-[#121213] border border-[#3a3a3c] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gray-400 transition-colors"
            placeholder="e.g. Sam"
            value={name} 
            onChange={e => { setName(e.target.value); clearError(); }} 
            maxLength={20} 
            required 
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 pt-6">
          <button 
            type="button" 
            className="w-full sm:w-auto sm:flex-shrink-0 px-8 py-4 rounded-xl font-bold bg-[#1a1a1b] border border-[#3a3a3c] text-white hover:bg-[#2a2a2c] transition-colors order-2 sm:order-1"
            onClick={() => navigate('/')}
          >
            Back
          </button>
          <button 
            type="submit" 
            disabled={isLoading || isChecking || code.length !== 5 || !name.trim()}
            className={`w-full sm:flex-1 py-4 rounded-xl font-bold transition-all order-1 sm:order-2 ${
              !(isLoading || isChecking || code.length !== 5 || !name.trim())
                ? 'bg-wordle-green text-white hover:opacity-90 active:scale-[0.98]' 
                : 'bg-[#565758] text-[#121213] cursor-not-allowed'
            }`}
          >
            {isLoading || isChecking ? 'Joining...' : 'Join'}
          </button>
        </div>
      </form>
    </div>
  );
}
