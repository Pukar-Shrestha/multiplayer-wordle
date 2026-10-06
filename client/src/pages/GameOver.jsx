import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { GAME_STATES, ROLES } from '../utils/constants';

export default function GameOver() {
  const navigate = useNavigate();
  const { status, role, secretWord, winnerName, hostName, currentAttempt, roomCode, nextMatch, resetGame } = useGame();

  const isHost = role === ROLES.HOST;
  const isGuestWin = status === GAME_STATES.GUEST_WON;
  const isDisconnect = status === GAME_STATES.PLAYER_DISCONNECTED;

  let heading = '';
  let subtext = '';

  if (isDisconnect) {
    heading = 'Game Ended';
    subtext = 'The other player disconnected.';
  } else if (isHost) {
    if (isGuestWin) {
      heading = `${winnerName} Won!`;
      subtext = `${winnerName} guessed your word first.`;
    } else {
      heading = 'You Win!';
      subtext = 'None of the guests could guess your word in time.';
    }
  } else {
    if (isGuestWin) {
      if (winnerName) {
        heading = `${winnerName} Won!`;
        subtext = `${winnerName} guessed ${hostName}'s word first.`;
      } else {
        heading = 'You Got It!';
        subtext = `You guessed ${hostName}'s word!`;
      }
    } else {
      heading = 'Game Over';
      subtext = 'Nobody figured out the word.';
    }
  }

  return (
    <div className="page-container justify-center">
      <div className="card text-center space-y-6">
        <h1 className="text-4xl font-bold text-white mb-2">{heading}</h1>
        <p className="text-gray-300 leading-relaxed">{subtext}</p>
        
        {secretWord && (
          <div className="my-8 p-6 bg-wordle-dark rounded-lg border border-gray-800">
            <p className="text-sm text-gray-500 uppercase tracking-widest mb-3">The word was</p>
            <div className="text-4xl font-bold tracking-widest uppercase text-wordle-green">
              {secretWord}
            </div>
          </div>
        )}
        
        {nextMatch ? (
          <div className="my-6 p-4 bg-wordle-green/20 border border-wordle-green rounded-lg animate-pulse">
            <p className="text-wordle-green font-bold mb-4">
              {nextMatch.hostName} is hosting the next match!
            </p>
            <button 
              className="btn-primary w-full py-3"
              onClick={() => {
                resetGame();
                navigate(`/join/${nextMatch.newRoomCode}`);
              }}
            >
              Join Next Match
            </button>
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            <button 
              className="btn-primary w-full py-4"
              onClick={() => {
                navigate('/create', { state: { oldRoomCode: roomCode } });
              }}
            >
              Host Next Match
            </button>
            
            <button 
              className="btn-secondary w-full py-4"
              onClick={() => {
                resetGame();
                navigate('/');
              }}
            >
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
