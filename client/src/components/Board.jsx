import Tile from './Tile';
import { WORD_LENGTH, MAX_ATTEMPTS, GAME_STATES, RESULT_TO_STATE } from '../utils/constants';

export default function Board({ guesses = [], currentGuess = '', isHostView = false, shakeRow = false, status }) {
  const empties = Math.max(0, MAX_ATTEMPTS - 1 - guesses.length);

  return (
    <div className="wordle-board" style={{ transform: isHostView ? 'scale(0.8)' : 'scale(1)', transformOrigin: 'top center', margin: '0 auto' }}>
      {guesses.map((g, i) => (
        <div key={i} className="wordle-row">
          {g.result.map((res, j) => (
            <Tile 
              key={j} 
              // Wait, host now receives the word! It's g.word or g.guess.
              // We mapped it to g.word in context, or g.guess. In hostGuessView we have g.guess
              letter={g.guess ? g.guess[j] : (g.word ? g.word[j] : '')} 
              state={RESULT_TO_STATE[res] || res} 
              animate={status === GAME_STATES.GUEST_WON && i === guesses.length - 1} 
            />
          ))}
        </div>
      ))}
      
      {/* 2. Active input row */}
      {guesses.length < MAX_ATTEMPTS && (
        <div className={`wordle-row ${shakeRow ? 'row-shake' : ''}`}>
          {Array.from({ length: WORD_LENGTH }).map((_, i) => {
            const letter = currentGuess ? currentGuess[i] || '' : '';
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
