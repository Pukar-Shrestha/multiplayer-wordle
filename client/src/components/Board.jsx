import Tile from './Tile';
import { WORD_LENGTH, MAX_ATTEMPTS, ROLES, GAME_STATES, RESULT_TO_STATE } from '../utils/constants';
import { useGame } from '../context/GameContext';

export default function Board() {
  const { guesses, hostGuessView, currentGuess, shakeRow, status, role } = useGame();
  
  const isHost = role === ROLES.HOST;
  // Host sees colours only without letters; Guest sees full words
  const displayGuesses = isHost ? hostGuessView : guesses;
  const empties = Math.max(0, MAX_ATTEMPTS - 1 - displayGuesses.length);

  return (
    <div className="wordle-board">
      {displayGuesses.map((g, i) => (
        <div key={i} className="wordle-row">
          {g.result.map((res, j) => (
            <Tile 
              key={j} 
              letter={g.word ? g.word[j] : ''} 
              state={RESULT_TO_STATE[res] || res} 
              animate={status === GAME_STATES.GUEST_WON && i === displayGuesses.length - 1} 
            />
          ))}
        </div>
      ))}
      
      {/* 2. Active input row */}
      {displayGuesses.length < MAX_ATTEMPTS && (
        <div className={`wordle-row ${shakeRow ? 'row-shake' : ''}`}>
          {Array.from({ length: WORD_LENGTH }).map((_, i) => {
            const letter = (currentGuess && !isHost) ? currentGuess[i] || '' : '';
            return <Tile key={i} letter={letter} state={letter ? 'filled' : 'empty'} />;
          })}
        </div>
      )}
      
      {/* 3. Empty rows remaining */}
      {Array.from({ length: empties }).map((_, i) => (
        <div key={`empty-${i}`} className="wordle-row">
          {Array.from({ length: WORD_LENGTH }).map((_, j) => (
            <Tile key={j} letter="" state="empty" />
          ))}
        </div>
      ))}
    </div>
  );
}
