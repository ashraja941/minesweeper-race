const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Store active games
const games = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        // Clean up any game rooms this client was in
        cleanupClient(ws);
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'create_game':
            createGame(ws, data);
            break;
        case 'join_game':
            joinGame(ws, data);
            break;
        case 'game_action':
            handleGameAction(ws, data);
            break;
        case 'restart_game':
            handleRestartGame(ws);
            break;
        case 'first_click':
            handleFirstClick(ws, data);
            break;
        case 'coop_action':
            handleCoopAction(ws, data);
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

function createGame(ws, data) {
    const width = parseInt(data.width, 10) || 9;
    const height = parseInt(data.height, 10) || 9;
    const mines = parseInt(data.mines, 10) || 10;
    const coop = !!data.coop;
    const flagTimer = parseInt(data.flagTimer, 10) || 0;
    const gameId = generateGameId();
    const game = {
        id: gameId,
        players: [ws],
        board: null,
        started: false,
        winner: null,
        width,
        height,
        mines,
        coop,
        flagTimer
    };
    games.set(gameId, game);
    ws.gameId = gameId;
    ws.send(JSON.stringify({
        type: 'game_created',
        gameId: gameId
    }));
    console.log(`Game created: ${gameId} (coop: ${coop}, flagTimer: ${flagTimer})`);
}

function joinGame(ws, data) {
    const game = games.get(data.gameId);
    if (!game) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Game not found'
        }));
        return;
    }
    
    if (game.players.length >= 2) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Game is full'
        }));
        return;
    }
    
    game.players.push(ws);
    ws.gameId = data.gameId;
    
    // Start the game when both players are ready
    if (game.players.length === 2) {
        startGame(game);
    }
    
    console.log(`Player joined game: ${data.gameId}`);
}

function startGame(game) {
    // Do not generate the board yet
    game.board = null;
    game.started = true;
    game.restartRequests = [false, false];
    game.firstClick = false;
    // Send board dimensions and flagTimer to both players
    game.players.forEach(player => {
        player.send(JSON.stringify({
            type: 'game_started',
            width: game.width,
            height: game.height,
            mines: game.mines,
            flagTimer: game.flagTimer
        }));
    });
    console.log(`Game started: ${game.id}`);
}

function handleGameAction(ws, data) {
    const game = games.get(ws.gameId);
    if (!game || !game.started) return;
    
    // Handle player actions (reveal cell, flag cell, etc.)
    // Now handle win/lose
    if (data.action === 'win') {
        if (!game.winner) {
            game.winner = ws;
            // Notify both players
            game.players.forEach(player => {
                player.send(JSON.stringify({
                    type: 'game_result',
                    winner: ws === player ? 'you' : 'opponent',
                    reason: 'win'
                }));
            });
            game.started = false;
        }
    } else if (data.action === 'lose') {
        if (!game.winner) {
            const loser = ws;
            const winner = game.players.find(p => p !== ws);
            game.winner = winner;
            game.started = false;
            // If reason is flag_timer, send a special message
            const isFlagTimer = data.reason === 'flag_timer';
            game.players.forEach(player => {
                player.send(JSON.stringify({
                    type: 'game_result',
                    winner: player === winner ? 'you' : 'opponent',
                    reason: isFlagTimer ? 'flag_timer' : 'opponent_lost',
                    ...(data.bomb ? { bomb: data.bomb } : {})
                }));
            });
        }
    }
}

function handleRestartGame(ws) {
    const game = games.get(ws.gameId);
    if (!game || !game.players.includes(ws)) return;
    const idx = game.players.indexOf(ws);
    game.restartRequests = game.restartRequests || [false, false];
    game.restartRequests[idx] = true;
    if (game.restartRequests[0] && game.restartRequests[1]) {
        // Both players requested restart
        game.restartRequests = [false, false];
        game.winner = null;
        startGame(game);
        game.players.forEach(player => {
            player.send(JSON.stringify({
                type: 'game_restarted',
                board: game.board
            }));
        });
    } else {
        ws.send(JSON.stringify({ type: 'restart_waiting' }));
    }
}

function cleanupClient(ws) {
    if (ws.gameId) {
        const game = games.get(ws.gameId);
        if (game) {
            game.players = game.players.filter(player => player !== ws);
            if (game.players.length === 0) {
                games.delete(ws.gameId);
            }
        }
    }
}

function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateBoard(width, height, mineCount) {
    // Create empty board
    const board = [];
    for (let y = 0; y < height; y++) {
        board[y] = [];
        for (let x = 0; x < width; x++) {
            board[y][x] = {
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0
            };
        }
    }
    
    // Place mines randomly
    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        
        if (!board[y][x].isMine) {
            board[y][x].isMine = true;
            minesPlaced++;
        }
    }
    
    // Calculate neighbor mine counts
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!board[y][x].isMine) {
                board[y][x].neighborMines = countNeighborMines(board, x, y);
            }
        }
    }
    
    return board;
}

function countNeighborMines(board, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < board.length && nx >= 0 && nx < board[0].length) {
                if (board[ny][nx].isMine) count++;
            }
        }
    }
    return count;
}

function handleFirstClick(ws, data) {
    const game = games.get(ws.gameId);
    if (!game || game.board) return; // Only allow once
    const { x, y } = data;
    // Generate board with (x, y) safe
    game.board = generateBoardSafe(game.width, game.height, game.mines, x, y);
    // Send board and reveal instruction to both players
    game.players.forEach(player => {
        player.send(JSON.stringify({
            type: 'board_generated',
            board: game.board,
            reveal: { x, y }
        }));
    });
}

function generateBoardSafe(width, height, mineCount, safeX, safeY) {
    // Create empty board
    const board = [];
    for (let y = 0; y < height; y++) {
        board[y] = [];
        for (let x = 0; x < width; x++) {
            board[y][x] = {
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0
            };
        }
    }
    // Mark safe zone (clicked cell and neighbors)
    const safeZone = new Set();
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = safeX + dx;
            const ny = safeY + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                safeZone.add(`${nx},${ny}`);
            }
        }
    }
    // Place mines randomly, avoiding safe zone
    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        if (!board[y][x].isMine && !safeZone.has(`${x},${y}`)) {
            board[y][x].isMine = true;
            minesPlaced++;
        }
    }
    // Calculate neighbor mine counts
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!board[y][x].isMine) {
                board[y][x].neighborMines = countNeighborMines(board, x, y);
            }
        }
    }
    return board;
}

function handleCoopAction(ws, data) {
    const game = games.get(ws.gameId);
    if (!game || !game.started || !game.coop || !game.board) return;
    const { action, x, y } = data;
    const cell = game.board[y] && game.board[y][x];
    if (!cell) return;
    if (action === 'reveal') {
        if (cell.isRevealed || cell.isFlagged) return;
        cell.isRevealed = true;
        // If it's a mine, both lose
        if (cell.isMine) {
            game.started = false;
            game.players.forEach(player => {
                player.send(JSON.stringify({
                    type: 'game_result',
                    winner: 'opponent',
                    reason: 'opponent_lost',
                    bomb: { x, y }
                }));
            });
            return;
        }
        // If it's empty, reveal neighbors (flood fill)
        if (cell.neighborMines === 0) {
            coopFloodReveal(game, x, y);
        }
        // Broadcast the reveal to both players
        game.players.forEach(player => {
            player.send(JSON.stringify({
                type: 'coop_update',
                action: 'reveal',
                x, y
            }));
        });
        // Check for win
        if (coopCheckWin(game)) {
            game.started = false;
            game.players.forEach(player => {
                player.send(JSON.stringify({
                    type: 'game_result',
                    winner: 'you',
                    reason: 'win'
                }));
            });
        }
    } else if (action === 'flag') {
        if (cell.isRevealed) return;
        cell.isFlagged = !cell.isFlagged;
        // Broadcast the flag/unflag to both players
        game.players.forEach(player => {
            player.send(JSON.stringify({
                type: 'coop_update',
                action: 'flag',
                x, y,
                flagged: cell.isFlagged
            }));
        });
    }
}

function coopFloodReveal(game, x, y) {
    const width = game.width;
    const height = game.height;
    const stack = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const neighbor = game.board[ny][nx];
                    if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
                        neighbor.isRevealed = true;
                        game.players.forEach(player => {
                            player.send(JSON.stringify({
                                type: 'coop_update',
                                action: 'reveal',
                                x: nx, y: ny
                            }));
                        });
                        if (neighbor.neighborMines === 0) {
                            stack.push([nx, ny]);
                        }
                    }
                }
            }
        }
    }
}

function coopCheckWin(game) {
    for (let y = 0; y < game.height; y++) {
        for (let x = 0; x < game.width; x++) {
            const cell = game.board[y][x];
            if (!cell.isMine && !cell.isRevealed) {
                return false;
            }
        }
    }
    return true;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
}); 