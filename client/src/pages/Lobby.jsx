import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useGame } from '../context/GameContext';
import { ROLES, GAME_STATES } from '../utils/constants';
import { copyToClipboard } from '../utils/clipboard';

export default function Lobby() {
  const navigate = useNavigate();
  const { role, roomCode, joinUrl, status, hostName, guestName, startGame } = useGame();
  const [copied, setCopied] = useState(false);

  // Redirect if no active room, or if game already started
  useEffect(() => {
    if (!roomCode) navigate('/');
    if (status === GAME_STATES.IN_PROGRESS) navigate(`/game/${roomCode}`);
  }, [roomCode, status, navigate]);

  if (!roomCode) return null;

  const isHost = role === ROLES.HOST;
  const isReady = status === GAME_STATES.READY_TO_START;

  const handleCopy = async () => {
    if (await copyToClipboard(joinUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="page-container pt-8 md:pt-12">
      <h1 className="text-3xl font-bold mb-2 text-wordle-green">Room: {roomCode}</h1>
      <p className="text-gray-400 mb-8">Waiting for game to start...</p>
      
      <div className="card space-y-6 flex flex-col items-center w-full">
        {/* Player Roster */}
        <div className="w-full flex justify-between items-center bg-wordle-dark p-4 rounded-lg">
          <div className="text-center w-1/2 border-r border-gray-700">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Host</div>
            <div className="font-bold truncate px-2">{hostName || '...'}</div>
          </div>
          <div className="text-center w-1/2">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Guest</div>
            <div className="font-bold text-wordle-green truncate px-2">
              {guestName || 'Waiting...'}
            </div>
          </div>
        </div>

        {/* Host controls (Waiting) */}
        {isHost && !isReady && (
          <div className="flex flex-col items-center space-y-4 w-full">
            <p className="text-sm text-gray-400 text-center">Share this code or scan to join:</p>
            <div className="bg-white p-4 rounded-xl">
              <QRCode value={joinUrl || ''} size={150} />
            </div>
            <button className="btn-secondary flex items-center justify-center gap-2" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy Invite Link'}
            </button>
          </div>
        )}

        {/* Host controls (Ready) */}
        {isHost && isReady && (
          <button className="btn-primary mt-4 py-4 text-lg animate-pulse" onClick={startGame}>
            Start Game
          </button>
        )}

        {/* Guest waiting message */}
        {!isHost && !isReady && (
          <p className="text-center text-gray-400 mt-4 animate-pulse">
            Waiting for host to start...
          </p>
        )}
      </div>
    </div>
  );
}
