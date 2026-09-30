export default function Tile({ letter, state, animate }) {
  const stateClass = state ? `tile--${state}` : 'tile--empty';
  const animationClass = animate ? 'tile-win' : '';
  
  return (
    <div className={`tile ${stateClass} ${animationClass}`}>
      {letter}
    </div>
  );
}
