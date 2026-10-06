import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useGame } from '../context/GameContext';
import { ROLES, GAME_STATES } from '../utils/constants';
import { copyToClipboard } from '../utils/clipboard';

export default function Lobby() {
  const navigate = useNavigate();
  const { role, roomCode, joinUrl, status, hostName, guests = [], settings, startGame } = useGame();
  const [copied, setCopied] = useState(false);

  // Redirect if no active room, or if game already started
  useEffect(() => {
    if (!roomCode) navigate('/');
    if (status === GAME_STATES.IN_PROGRESS) navigate(`/game/${roomCode}`);
  }, [roomCode, status, navigate]);

  if (!roomCode) return null;

  const isHost = role === ROLES.HOST;
  const isReady = status === GAME_STATES.READY_TO_START;
  const maxGuests = settings?.maxGuests || 5;
  const timerMinutes = settings?.timerMinutes || 5;

  const handleCopy = async () => {
    if (await copyToClipboard(joinUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="page-container pt-8 md:pt-12">
      <h1 className="text-3xl font-bold mb-2 text-wordle-green">Room: {roomCode}</h1>
      <p className="text-gray-400 mb-6">
        Host: {hostName} • {timerMinutes} Min Timer
      </p>
      
      <div className="card space-y-6 flex flex-col items-center w-full">
        {/* Player Roster */}
        <div className="w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-white">Players</h3>
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
              {guests.length} / {maxGuests}
            </span>
          </div>
          
          <div className="space-y-2">
            {guests.map((g, i) => (
              <div key={i} className="flex justify-between items-center bg-wordle-dark p-3 rounded-lg border border-gray-700">
                <span className="font-bold text-wordle-green">{g.name}</span>
                <span className="text-xs text-gray-500 uppercase tracking-widest">Ready</span>
              </div>
            ))}
            {guests.length === 0 && (
              <div className="text-center bg-wordle-dark p-6 rounded-lg border border-gray-700 border-dashed">
                <p className="text-gray-500">Waiting for players to join...</p>
              </div>
            )}
          </div>
        </div>

        {/* Host controls (Waiting) */}
        {isHost && guests.length < maxGuests && (
          <div className="flex flex-col items-center space-y-4 w-full border-t border-gray-700 pt-6 mt-6">
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
        {isHost && guests.length > 0 && (
          <button className="btn-primary mt-4 py-4 text-lg animate-pulse w-full" onClick={startGame}>
            Start Game
          </button>
        )}

        {/* Guest waiting message */}
        {!isHost && (
          <p className="text-center text-gray-400 mt-4 animate-pulse">
            Waiting for host to start...
          </p>
        )}
      </div>
    </div>
  );
}
