"// Minesweeper frontend JS placeholder"  

class MinesweeperGame {
    constructor() {
        this.ws = null;
        this.gameId = null;
        this.board = null;
        this.gameStarted = false;
        this.gameFinished = false;
        this.startTime = null;
        this.timer = null;
        this.waitingForFirstClick = true;
        this.totalMines = null;
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        this.elements = {
            gameSetup: document.getElementById('game-setup'),
            gameBoard: document.getElementById('game-board'),
            createGameBtn: document.getElementById('create-game-btn'),
            joinGameBtn: document.getElementById('join-game-btn'),
            gameIdInput: document.getElementById('game-id-input'),
            gameInfo: document.getElementById('game-info'),
            currentGameId: document.getElementById('current-game-id'),
            gameStatus: document.getElementById('game-status'),
            boardContainer: document.getElementById('board-container'),
            playerTime: document.getElementById('player-time'),
            newGameBtn: document.getElementById('new-game-btn'),
            gameResult: document.getElementById('game-result'),
            resultMessage: document.getElementById('result-message'),
            restartGameBtn: document.getElementById('restart-game-btn'),
            gridWidth: document.getElementById('grid-width'),
            gridHeight: document.getElementById('grid-height'),
            gridMines: document.getElementById('grid-mines'),
            bombsRemaining: document.getElementById('bombs-remaining')
        };
    }
    
    bindEvents() {
        this.elements.createGameBtn.addEventListener('click', () => this.createGame());
        this.elements.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.elements.newGameBtn.addEventListener('click', () => this.resetGame());
        this.elements.restartGameBtn.addEventListener('click', () => this.requestRestart());
        
        // Allow Enter key to join game
        this.elements.gameIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });
    }
    
    connectWebSocket(callback) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (callback) callback();
            return;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            console.log('Connected to server');
            if (callback) callback();
        };
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            this.showError('Connection lost. Please refresh the page.');
        };
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('Connection error. Please check your internet connection.');
        };
    }
    
    createGame() {
        const width = parseInt(this.elements.gridWidth.value, 10) || 9;
        const height = parseInt(this.elements.gridHeight.value, 10) || 9;
        const mines = parseInt(this.elements.gridMines.value, 10) || 10;
        this.totalMines = mines;
        this.connectWebSocket(() => {
            this.ws.send(JSON.stringify({ type: 'create_game', width, height, mines }));
        });
    }
    
    joinGame() {
        const gameId = this.elements.gameIdInput.value.trim().toUpperCase();
        if (!gameId) {
            this.showError('Please enter a game ID');
            return;
        }
        this.connectWebSocket(() => {
            this.ws.send(JSON.stringify({ type: 'join_game', gameId: gameId }));
        });
    }
    
    handleServerMessage(data) {
        switch (data.type) {
            case 'game_created':
                this.gameId = data.gameId;
                this.elements.currentGameId.textContent = data.gameId;
                this.elements.gameInfo.classList.remove('hidden');
                this.elements.gameStatus.textContent = 'Waiting for opponent...';
                break;
                
            case 'game_started':
                this.totalMines = data.mines;
                this.startGame({ width: data.width, height: data.height, mines: data.mines });
                break;
                
            case 'board_generated':
                this.board = data.board;
                this.waitingForFirstClick = false;
                this.revealCell(data.reveal.x, data.reveal.y, true);
                break;
                
            case 'error':
                this.showError(data.message);
                break;
                
            case 'game_finished':
                this.handleGameFinished(data);
                break;
                
            case 'game_result':
                this.handleGameResult(data);
                break;
                
            case 'restart_waiting':
                this.elements.resultMessage.textContent = 'Waiting for opponent to restart...';
                break;
                
            case 'game_restarted':
                this.startGame(data.board);
                this.elements.restartGameBtn.classList.add('hidden');
                break;
        }
    }
    
    startGame(boardOrDims) {
        // If boardOrDims is a board, use it; if it's dimensions, create empty board
        if (Array.isArray(boardOrDims)) {
            this.board = boardOrDims;
        } else {
            // boardOrDims is { width, height, mines }
            this.board = [];
            for (let y = 0; y < boardOrDims.height; y++) {
                this.board[y] = [];
                for (let x = 0; x < boardOrDims.width; x++) {
                    this.board[y][x] = {
                        isMine: false,
                        isRevealed: false,
                        isFlagged: false,
                        neighborMines: 0
                    };
                }
            }
            this.waitingForFirstClick = true;
        }
        this.gameStarted = true;
        this.gameFinished = false;
        this.startTime = Date.now();
        this.elements.gameSetup.classList.add('hidden');
        this.elements.gameBoard.classList.remove('hidden');
        this.elements.gameStatus.textContent = 'Game in progress';
        this.renderBoard();
        this.startTimer();
        this.elements.restartGameBtn.classList.add('hidden');
        this.elements.restartGameBtn.disabled = false;
        this.elements.gameResult.classList.add('hidden');
        this.elements.gameResult.classList.remove('win', 'lose');
        this.elements.resultMessage.textContent = '';
        if (boardOrDims.mines) this.totalMines = boardOrDims.mines;
        this.updateBombsRemaining();
    }
    
    renderBoard() {
        const boardElement = document.createElement('div');
        boardElement.className = 'minesweeper-board';
        boardElement.style.gridTemplateColumns = `repeat(${this.board[0].length}, 40px)`;
        
        for (let y = 0; y < this.board.length; y++) {
            for (let x = 0; x < this.board[y].length; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                // Add event listeners
                cell.addEventListener('click', (e) => this.handleCellClick(x, y, e));
                cell.addEventListener('contextmenu', (e) => this.handleCellRightClick(x, y, e));
                
                boardElement.appendChild(cell);
            }
        }
        
        this.elements.boardContainer.innerHTML = '';
        this.elements.boardContainer.appendChild(boardElement);
    }
    
    handleCellClick(x, y, event) {
        if (!this.gameStarted || this.gameFinished) return;
        if (this.waitingForFirstClick) {
            // Send first click to server
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'first_click', x, y }));
            }
            // Prevent further clicks until board is generated
            this.waitingForFirstClick = false;
            return;
        }
        const cell = this.board[y][x];
        if (cell.isFlagged) return;
        // If clicking on a revealed number cell, implement chording
        if (cell.isRevealed && cell.neighborMines > 0) {
            this.handleChording(x, y);
            return;
        }
        if (cell.isRevealed) return;
        if (cell.isMine) {
            // Send lose action to server, do not end game locally
            this.sendGameAction('lose');
            return;
        } else {
            this.revealCell(x, y);
            this.checkWin();
        }
    }
    
    handleChording(x, y) {
        const cell = this.board[y][x];
        const flaggedCount = this.countFlaggedNeighbors(x, y);
        
        if (flaggedCount === cell.neighborMines) {
            // All bombs around this cell are flagged, reveal unflagged neighbors
            this.revealUnflaggedNeighbors(x, y);
        }
    }
    
    countFlaggedNeighbors(x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ny = y + dy;
                const nx = x + dx;
                
                if (ny >= 0 && ny < this.board.length && 
                    nx >= 0 && nx < this.board[0].length) {
                    if (this.board[ny][nx].isFlagged) {
                        count++;
                    }
                }
            }
        }
        return count;
    }
    
    revealUnflaggedNeighbors(x, y) {
        let hitMine = false;
        
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ny = y + dy;
                const nx = x + dx;
                
                if (ny >= 0 && ny < this.board.length && 
                    nx >= 0 && nx < this.board[0].length) {
                    const neighbor = this.board[ny][nx];
                    
                    if (!neighbor.isRevealed && !neighbor.isFlagged) {
                        if (neighbor.isMine) {
                            hitMine = true;
                        }
                        this.revealCell(nx, ny);
                    }
                }
            }
        }
        
        if (hitMine) {
            this.gameOver(false);
        } else {
            this.checkWin();
        }
    }
    
    handleCellRightClick(x, y, event) {
        event.preventDefault();
        if (!this.gameStarted || this.gameFinished) return;
        
        const cell = this.board[y][x];
        if (cell.isRevealed) return;
        
        cell.isFlagged = !cell.isFlagged;
        this.updateCellDisplay(x, y);
        this.updateBombsRemaining();
    }
    
    revealCell(x, y, force) {
        const cell = this.board[y][x];
        if ((cell.isRevealed || cell.isFlagged) && !force) return;
        cell.isRevealed = true;
        this.updateCellDisplay(x, y);
        if (cell.neighborMines === 0) {
            this.revealNeighbors(x, y);
        }
    }
    
    revealNeighbors(x, y) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ny = y + dy;
                const nx = x + dx;
                
                if (ny >= 0 && ny < this.board.length && 
                    nx >= 0 && nx < this.board[0].length) {
                    this.revealCell(nx, ny);
                }
            }
        }
    }
    
    revealMine(x, y) {
        const cell = this.board[y][x];
        cell.isRevealed = true;
        this.updateCellDisplay(x, y);
    }
    
    updateCellDisplay(x, y) {
        const cell = this.board[y][x];
        const cellElement = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
        
        if (!cellElement) return;
        
        cellElement.className = 'cell';
        
        if (cell.isFlagged) {
            cellElement.classList.add('flagged');
            cellElement.textContent = '🚩';
        } else if (cell.isRevealed) {
            cellElement.classList.add('revealed');
            
            if (cell.isMine) {
                cellElement.classList.add('mine');
                cellElement.textContent = '💣';
            } else if (cell.neighborMines > 0) {
                cellElement.textContent = cell.neighborMines;
                cellElement.dataset.mines = cell.neighborMines;
            } else {
                cellElement.textContent = '';
            }
        } else {
            cellElement.textContent = '';
        }
    }
    
    checkWin() {
        let unrevealedCount = 0;
        for (let y = 0; y < this.board.length; y++) {
            for (let x = 0; x < this.board[y].length; x++) {
                if (!this.board[y][x].isRevealed && !this.board[y][x].isMine) {
                    unrevealedCount++;
                }
            }
        }
        if (unrevealedCount === 0 && !this.gameFinished) {
            this.sendGameAction('win');
            this.gameOver(true);
        }
    }
    
    gameOver(won) {
        this.gameFinished = true;
        this.stopTimer();
        // Reveal all mines
        for (let y = 0; y < this.board.length; y++) {
            for (let x = 0; x < this.board[y].length; x++) {
                if (this.board[y][x].isMine) {
                    this.revealMine(x, y, won);
                }
            }
        }
        this.showGameResult(won);
        this.elements.restartGameBtn.classList.remove('hidden');
        this.elements.restartGameBtn.disabled = false;
    }
    
    showGameResult(won) {
        this.elements.gameResult.classList.remove('hidden');
        this.elements.gameResult.classList.remove('win', 'lose');
        this.elements.gameResult.classList.add(won ? 'win' : 'lose');
        const time = this.getElapsedTime();
        if (won) {
            this.elements.resultMessage.textContent = `Congratulations! You won in ${time}!`;
        } else {
            this.elements.resultMessage.textContent = `Game Over! You hit a mine. Time: ${time}`;
        }
        this.elements.restartGameBtn.classList.remove('hidden');
        this.elements.restartGameBtn.disabled = false;
    }
    
    startTimer() {
        this.timer = setInterval(() => {
            const time = this.getElapsedTime();
            this.elements.playerTime.textContent = time;
        }, 1000);
    }
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    getElapsedTime() {
        if (!this.startTime) return '00:00';
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    resetGame() {
        this.gameStarted = false;
        this.gameFinished = false;
        this.board = null;
        this.gameId = null;
        
        this.stopTimer();
        
        this.elements.gameSetup.classList.remove('hidden');
        this.elements.gameBoard.classList.add('hidden');
        this.elements.gameInfo.classList.add('hidden');
        this.elements.gameResult.classList.add('hidden');
        this.elements.gameIdInput.value = '';
        this.elements.playerTime.textContent = '00:00';
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.elements.restartGameBtn.classList.add('hidden');
        this.elements.restartGameBtn.disabled = false;
        this.updateBombsRemaining();
    }
    
    showError(message) {
        alert(message); // Simple error display for now
    }
    
    sendGameAction(action) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'game_action', action }));
        }
    }
    
    handleGameResult(data) {
        this.gameFinished = true;
        this.stopTimer();
        for (let y = 0; y < this.board.length; y++) {
            for (let x = 0; x < this.board[y].length; x++) {
                if (this.board[y][x].isMine) {
                    this.revealMine(x, y, data.winner === 'you');
                }
            }
        }
        this.elements.gameResult.classList.remove('hidden');
        this.elements.gameResult.classList.remove('win', 'lose');
        this.elements.gameResult.classList.add(data.winner === 'you' ? 'win' : 'lose');
        this.elements.resultMessage.textContent = data.winner === 'you' ?
            'You win! 🎉' : 'You lose! Opponent finished first.';
        this.elements.restartGameBtn.classList.remove('hidden');
        this.elements.restartGameBtn.disabled = false;
    }
    
    requestRestart() {
        this.elements.restartGameBtn.disabled = true;
        this.elements.resultMessage.textContent = 'Waiting for opponent to restart...';
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'restart_game' }));
        }
    }
    
    updateBombsRemaining() {
        let flagged = 0;
        if (this.board) {
            for (let y = 0; y < this.board.length; y++) {
                for (let x = 0; x < this.board[y].length; x++) {
                    if (this.board[y][x].isFlagged) flagged++;
                }
            }
        }
        const remaining = Math.max(0, (this.totalMines || 0) - flagged);
        this.elements.bombsRemaining.textContent = `Bombs remaining: ${remaining}`;
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MinesweeperGame();
});  
