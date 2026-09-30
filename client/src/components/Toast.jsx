import { useGame } from '../context/GameContext';

export default function Toast() {
  const { toast } = useGame();
  
  if (!toast) return null;
  
  return (
    <div className={`toast toast--${toast.type}`}>
      {toast.message}
    </div>
  );
}
