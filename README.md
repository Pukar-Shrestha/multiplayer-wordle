# Multiplayer Wordle

A real-time multiplayer Wordle clone built with the MERN stack and Socket.IO.

## Architecture

- **Frontend:** React, Vite, Tailwind CSS, React Router, Socket.IO Client.
- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), Jest.
- **State Management:** React Context + `useReducer` for deterministic game state.
- **Real-time:** WebSockets with polling fallback; dual-store architecture (In-Memory `Map` + MongoDB sync) for instant low-latency delivery with persistence.

## Features

- **Host a Game:** Create a room with a custom 5-letter secret word.
- **Join a Game:** Join via 5-character room code or QR code link.
- **Real-time Spectating:** Host sees tile colors flip live as the guest guesses, but never sees the word they are typing until submitted.
- **Security:** Server is strictly authoritative. The guest never receives the `secretWord` in API or Socket payloads until the game explicitly ends.
- **Dictionary Validation:** Server scores guesses against a strict dictionary.
- **Disconnection Handling:** If a player drops, they have a 60-second grace period to refresh or reconnect. `sessionStorage` restores identity seamlessly.

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB (running locally or via Atlas)

### Backend Setup

1. `cd server`
2. `npm install`
3. Set up environment:
   ```bash
   cp .env.example .env
   # Ensure MONGODB_URI points to your database
   ```
4. Start development server: `npm run dev`
5. Run tests: `npm test`

### Frontend Setup

1. `cd client`
2. `npm install`
3. Set up environment:
   ```bash
   cp .env.example .env
   # Ensure VITE_SERVER_URL points to backend (default: http://localhost:5000)
   ```
4. Start development server: `npm run dev`

## Gameplay Rules

1. The word must be exactly 5 letters and a valid English word.
2. The guest gets 6 attempts to guess it.
3. Green tile = Correct letter, correct spot.
4. Yellow tile = Correct letter, wrong spot.
5. Gray tile = Letter not in the word.

## License
MIT
