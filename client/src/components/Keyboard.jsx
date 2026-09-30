import { KEYBOARD_ROWS, RESULT_TO_STATE } from '../utils/constants';
import { useGame } from '../context/GameContext';

export default function Keyboard() {
  const { guesses, typeLetter, deleteLetter, submitGuess } = useGame();

  // Compute key states (green > yellow > gray)
  const keyStates = {};
  guesses.forEach(g => {
    if (!g.word) return;
    g.word.split('').forEach((letter, i) => {
      const res = RESULT_TO_STATE[g.result[i]] || g.result[i];
      const upper = letter.toUpperCase();
      if (res === 'correct') {
        keyStates[upper] = 'correct';
      } else if (res === 'present' && keyStates[upper] !== 'correct') {
        keyStates[upper] = 'present';
      } else if (res === 'absent' && !keyStates[upper]) {
        keyStates[upper] = 'absent';
      }
    });
  });

  return (
    <div className="keyboard">
      {KEYBOARD_ROWS.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map(key => {
            const state = keyStates[key];
            const isWide = key === 'ENTER' || key === '⌫';
            const className = `key ${isWide ? 'key--wide' : ''} ${state ? `key--${state}` : ''}`;
            
            return (
              <button
                key={key}
                className={className}
                onClick={() => {
                  if (key === 'ENTER') submitGuess();
                  else if (key === '⌫') deleteLetter();
                  else typeLetter(key);
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
