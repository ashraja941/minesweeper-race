# Multiplayer Minesweeper

A real-time multiplayer version of the classic Minesweeper game where two players race to complete the same board first.

## Features

- **Real-time multiplayer**: Two players can play simultaneously on the same board
- **Race mode**: First player to complete the board wins
- **Classic Minesweeper rules**: Including chording (clicking on revealed numbers)
- **Timer**: Track your completion time
- **Modern UI**: Clean, responsive design

## How to Play

### Setup
1. Start the server: `cd backend && npm start`
2. Open `http://localhost:3000` in your browser
3. Player 1: Click "Create New Game" and share the Game ID with Player 2
4. Player 2: Enter the Game ID and click "Join Game"

### Game Rules
- **Left click**: Reveal a cell
- **Right click**: Flag/unflag a cell (mark as potential mine)
- **Click on revealed number**: If you've flagged all mines around it, this will reveal all unflagged neighbors
- **Goal**: Reveal all non-mine cells to win
- **Race**: First player to complete the board wins!

### Controls
- **Left Click**: Reveal cell
- **Right Click**: Flag/unflag cell
- **Click on number**: Chord (reveal neighbors if all mines are flagged)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser

## Technical Details

- **Backend**: Node.js with Express and WebSocket
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Communication**: WebSocket for real-time updates
- **Board Generation**: Server-side for consistency

## Future Enhancements

- Different board sizes and difficulties
- Leaderboards
- Chat functionality
- Spectator mode
- Mobile support

## License

MIT License 