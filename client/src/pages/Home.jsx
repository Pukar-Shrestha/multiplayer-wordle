import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  
  return (
    <div className="page-container justify-center">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-wider uppercase text-wordle-green">
          Wordle
        </h1>
        <h2 className="text-xl md:text-2xl font-semibold text-gray-300">
          Multiplayer Edition
        </h2>
      </div>
      
      <div className="card space-y-4">
        <button 
          className="btn-primary" 
          onClick={() => navigate('/create')}
        >
          Create Game
        </button>
        <button 
          className="btn-secondary" 
          onClick={() => navigate('/join')}
        >
          Join Game
        </button>
      </div>
    </div>
  );
}
