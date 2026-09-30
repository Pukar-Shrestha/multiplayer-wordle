import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { GAME_STATES, ROLES } from '../utils/constants';

export default function GameOver() {
  const navigate = useNavigate();
  const { status, role, secretWord, guestName, hostName, currentAttempt, resetGame } = useGame();

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
      heading = 'They Got It!';
      subtext = `${guestName} guessed your word in ${currentAttempt} attempts.`;
    } else {
      heading = 'You Win!';
      subtext = `${guestName} failed to guess your word.`;
    }
  } else {
    if (isGuestWin) {
      heading = 'You Got It!';
      subtext = `You guessed ${hostName}'s word in ${currentAttempt} attempts.`;
    } else {
      heading = 'Game Over';
      subtext = `You ran out of attempts!`;
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
        
        <button className="btn-primary w-full mt-4 py-4" onClick={resetGame}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
