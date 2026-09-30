import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { checkRoomExists } from '../services/api';

export default function JoinGame() {
  const navigate = useNavigate();
  const { roomCode: urlCode } = useParams();
  const { joinGame, isLoading, error, clearError, setToast } = useGame();
  
  const [name, setName] = useState('');
  const [code, setCode] = useState(urlCode || '');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (urlCode) setCode(urlCode);
  }, [urlCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    <div className="page-container pt-12">
      <h1 className="text-3xl font-bold mb-8">Join Game</h1>
      
      <form className="card space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm font-semibold">
            {error}
          </div>
        )}
        
        <div>
          <label className="block text-sm text-gray-400 mb-2">Room Code</label>
          <input 
            type="text" 
            className="game-input uppercase" 
            placeholder="5 chars (e.g. A1B2C)"
            value={code} 
            onChange={e => { setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '')); clearError(); }} 
            maxLength={5} 
            required 
            readOnly={!!urlCode}
          />
        </div>
        
        <div>
          <label className="block text-sm text-gray-400 mb-2">Your Name</label>
          <input 
            type="text" 
            className="game-input" 
            placeholder="e.g. Sam"
            value={name} 
            onChange={e => { setName(e.target.value); clearError(); }} 
            maxLength={20} 
            required 
          />
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
            disabled={isLoading || isChecking || code.length !== 5 || !name.trim()}
          >
            {isLoading || isChecking ? 'Joining...' : 'Join'}
          </button>
        </div>
      </form>
    </div>
  );
}
