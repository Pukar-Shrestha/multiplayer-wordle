import { useEffect } from 'react';
import { WORD_LENGTH } from '../utils/constants';

/**
 * Attaches physical keyboard listeners for the Wordle game.
 *
 * Handles:
 *   - Letter keys  (A–Z) → calls onKey(letter)
 *   - Enter key          → calls onEnter()
 *   - Backspace key      → calls onDelete()
 *
 * @param {object} params
 * @param {(letter: string) => void} params.onKey    - Called with uppercase letter
 * @param {() => void}               params.onEnter  - Called on Enter
 * @param {() => void}               params.onDelete - Called on Backspace
 * @param {boolean}                  params.isActive - Attach listener only when true
 */
export function useKeyboard({ onKey, onEnter, onDelete, isActive }) {
  useEffect(() => {
    // Don't attach if the game is not in a state where input is expected
    if (!isActive) return;

    function handleKeyDown(e) {
      // Ignore if a modifier key is held (prevent browser shortcuts)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // Ignore if focus is inside an input/textarea (typing in a form field)
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const key = e.key;

      if (key === 'Enter') {
        e.preventDefault();
        onEnter?.();
      } else if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        onDelete?.();
      } else if (/^[a-zA-Z]$/.test(key)) {
        onKey?.(key.toUpperCase());
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKey, onEnter, onDelete, isActive]);
}

/**
 * Determine whether the on-screen keyboard Enter key should be disabled.
 * Prevents spamming before a guess is ready.
 *
 * @param {string} currentGuess
 * @returns {boolean}
 */
export function isGuessReady(currentGuess) {
  return typeof currentGuess === 'string' && currentGuess.length === WORD_LENGTH;
}
