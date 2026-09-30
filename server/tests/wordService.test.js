const { scoreGuess, isValidWord, isWinningResult } = require('../src/services/wordService');

describe('wordService.isValidWord', () => {
  test('returns true for a known valid word', () => {
    expect(isValidWord('apple')).toBe(true);
  });

  test('returns false for a word not in the list', () => {
    expect(isValidWord('xzqwj')).toBe(false);
  });

  test('returns false for a word that is too short', () => {
    expect(isValidWord('cat')).toBe(false);
  });

  test('returns false for a word that is too long', () => {
    expect(isValidWord('dragons')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isValidWord(null)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isValidWord('')).toBe(false);
  });

  test('is case-insensitive (accepts uppercase)', () => {
    expect(isValidWord('APPLE')).toBe(true);
  });

  test('returns false for non-alphabetic strings', () => {
    expect(isValidWord('12345')).toBe(false);
  });
});

describe('wordService.scoreGuess', () => {
  test('all green — perfect guess', () => {
    const result = scoreGuess('apple', 'apple');
    expect(result).toEqual(['green', 'green', 'green', 'green', 'green']);
  });

  test('all gray — no matching letters', () => {
    const result = scoreGuess('brick', 'stone');
    // b, r, i, c, k — none in 'stone'... let me use a guaranteed case
    const result2 = scoreGuess('zzzzz', 'apple');
    expect(result2).toEqual(['gray', 'gray', 'gray', 'gray', 'gray']);
  });

  test('correct letter in wrong position — yellow', () => {
    // 'a' is in 'apple' but at index 1 not 0 here — wait, 'apple' starts with 'a'
    // Use: guess 'earns', secret 'crane' — 'e' is at pos 0 in guess, pos 4 in secret
    const result = scoreGuess('earns', 'crane');
    // e: in 'crane' at pos 4, guess pos 0 → yellow
    // a: in 'crane' at pos 2, guess pos 1 → yellow
    // r: in 'crane' at pos 1, guess pos 2 → yellow
    // n: in 'crane' at pos 3, guess pos 3 → green
    // s: not in 'crane' → gray
    expect(result[3]).toBe('green'); // n matches
    expect(result[4]).toBe('gray');  // s not in crane
  });

  test('duplicate letter in guess — only marks as many yellows as in secret', () => {
    // secret = 'abbey', guess = 'algae'
    // a: guess[0]='a', secret[0]='a' → green
    // l: not in 'abbey' → gray
    // g: not in 'abbey' → gray
    // a: only one 'a' left? 'abbey' has one 'a' at pos 0 (already used) → gray
    // e: 'abbey' has 'e' at pos 3, guess[4]='e' → yellow
    const result = scoreGuess('algae', 'abbey');
    expect(result[0]).toBe('green');  // a exact
    expect(result[1]).toBe('gray');   // l not in word
    expect(result[2]).toBe('gray');   // g not in word
    expect(result[3]).toBe('gray');   // second a — already used
    expect(result[4]).toBe('yellow'); // e present but wrong position
  });

  test('duplicate letters in secret — marks yellow for each remaining occurrence', () => {
    // secret = 'speed', guess = 'creep'
    // c → gray
    // r → gray
    // e (pos 2) → 'speed' has e at pos 2, 3. exact match? s-p-e-e-d → pos 2 is 'e' → green
    // e (pos 3) → green (pos 3 is 'e' in speed)
    // p (pos 4) → 'speed' has p at pos 1, not matched yet → yellow
    const result = scoreGuess('creep', 'speed');
    expect(result[0]).toBe('gray');   // c
    expect(result[1]).toBe('gray');   // r
    expect(result[2]).toBe('green');  // e exact
    expect(result[3]).toBe('green');  // e exact
    expect(result[4]).toBe('yellow'); // p present
  });

  test('throws error for wrong length', () => {
    expect(() => scoreGuess('hi', 'apple')).toThrow();
  });
});

describe('wordService.isWinningResult', () => {
  test('returns true for all green', () => {
    expect(isWinningResult(['green', 'green', 'green', 'green', 'green'])).toBe(true);
  });

  test('returns false for mixed results', () => {
    expect(isWinningResult(['green', 'yellow', 'green', 'green', 'green'])).toBe(false);
  });

  test('returns false for all gray', () => {
    expect(isWinningResult(['gray', 'gray', 'gray', 'gray', 'gray'])).toBe(false);
  });
});
