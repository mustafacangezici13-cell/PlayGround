import { createInitialPosition, legalMoves, makeMove, getBotMove, getStatus, isInCheck } from './src/chess.js';

// Ten fictional club members, each with a distinct playing style and challenge level.
const bots = [
  { name: 'Maya', rating: 200, personality: 'The cheerful beginner', description: 'Here for a good time', emoji: '🌼', image: 'maya' },
  { name: 'Leo', rating: 500, personality: 'The curious student', description: 'Learning something new', emoji: '📚', image: 'leo' },
  { name: 'Sophia', rating: 1000, personality: 'The clever creative', description: 'Always full of surprises', emoji: '🎨', image: 'sophia' },
  { name: 'Theo', rating: 1200, personality: 'The friendly rival', description: 'Loves a playful challenge', emoji: '☕', image: 'theo' },
  { name: 'Nora', rating: 1400, personality: 'The thoughtful tactician', description: 'Thinks a few moves ahead', emoji: '🌿', image: 'nora' },
  { name: 'Elliot', rating: 1500, personality: 'The cool strategist', description: 'Calm under pressure', emoji: '🎧', image: 'elliot' },
  { name: 'Isabella', rating: 1800, personality: 'The fearless competitor', description: 'Never backs down', emoji: '🔥', image: 'isabella' },
  { name: 'Victor', rating: 2000, personality: 'The seasoned expert', description: 'A master of the endgame', emoji: '🎩', image: 'victor' },
  { name: 'Aurora', rating: 2200, personality: 'The brilliant visionary', description: 'Sees the whole board', emoji: '✨', image: 'aurora' },
  { name: 'Magnus', rating: 2500, personality: 'The grandmaster', description: 'Your greatest challenge', emoji: '👑', image: 'magnus' },
];

const $ = id => document.getElementById(id);
let selectedBot = 0;

function renderBots() {
  $('bot-list').innerHTML = bots.map((bot, index) => `
    <button class="bot-card ${index === selectedBot ? 'active' : ''}" data-bot="${index}" aria-pressed="${index === selectedBot}">
      <span class="bot-avatar-wrap"><img class="bot-avatar" src="assets/portraits/${bot.image}.jpg" alt=""><span class="bot-emoji">${bot.emoji}</span></span>
      <span class="bot-info"><span class="bot-name">${bot.name} ${index === selectedBot ? '<span class="selected-label">SELECTED</span>' : ''}</span><span class="bot-desc">${bot.description}</span></span>
      <span class="bot-rating">${bot.rating.toLocaleString()}<small>ELO</small></span>
    </button>`).join('');
  $('bot-list').querySelectorAll('[data-bot]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.bot);
    if (index === selectedBot) return;
    selectedBot = index;
    renderBots();
    newGame();
  }));
  const bot = bots[selectedBot];
  $('current-avatar').src = `assets/portraits/${bot.image}.jpg`;
  $('current-avatar').alt = `${bot.name}'s portrait`;
  $('current-name').textContent = bot.name;
  $('current-rating').textContent = bot.rating.toLocaleString();
  $('current-personality').textContent = bot.personality;
}

// Game state is immutable in the engine; history entries keep the position and display state together.
let position = createInitialPosition();
let history = [];
let selectedSquare = null;
let lastMove = null;
let flipped = false;
let botThinking = false;
let botTurnToken = 0;
let pendingPromotion = null;

const pieceGlyphs = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};
const pieceNames = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
const files = 'abcdefgh';

function botStrength(rating) {
  return Math.max(1, Math.min(5, Math.round(1 + (rating - 200) * 4 / 2300)));
}

function currentStatus() {
  return getStatus(position);
}

function renderBoard() {
  const board = $('board');
  const status = currentStatus();
  const legalFromSelection = selectedSquare && position.turn === 'w' && !botThinking
    ? legalMoves(position, selectedSquare)
    : [];
  const targets = new Map();
  legalFromSelection.forEach(move => targets.set(move.to, true));
  const kingInCheck = status.inCheck
    ? Object.keys(position.board).find(square => position.board[square] === `${position.turn}K`)
    : null;
  const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const fileOrder = flipped ? [...files].reverse() : [...files];

  board.innerHTML = ranks.flatMap((rank, rowIndex) => fileOrder.map((file, columnIndex) => {
    const square = `${file}${rank + 1}`;
    const piece = position.board[square];
    const isLight = (files.indexOf(file) + rank) % 2 === 1;
    const classes = ['square', isLight ? 'light' : 'dark'];
    if (square === selectedSquare) classes.push('selected');
    if (lastMove && (square === lastMove.from || square === lastMove.to)) classes.push('last');
    if (square === kingInCheck) classes.push('check');
    const isTarget = targets.has(square);
    const coords = `${columnIndex === 0 ? `<span class="coord rank">${rank + 1}</span>` : ''}${rowIndex === 7 ? `<span class="coord file">${file}</span>` : ''}`;
    return `<button type="button" class="${classes.join(' ')}" data-square="${square}" aria-label="${square}${piece ? `, ${piece[0] === 'w' ? 'White' : 'Black'} ${pieceNames[piece[1]]}` : ''}${isTarget ? ', legal move' : ''}" ${botThinking || status.over ? 'disabled' : ''}>${piece ? `<span class="piece ${piece[0] === 'w' ? 'white' : 'black'}">${pieceGlyphs[piece]}</span>` : ''}${isTarget ? `<span class="move-dot ${piece ? 'capture' : ''}"></span>` : ''}${coords}</button>`;
  })).join('');

  board.querySelectorAll('[data-square]').forEach(button => {
    button.addEventListener('click', () => onSquareClick(button.dataset.square));
  });
  updateStatus(status);
}

function updateStatus(status = currentStatus()) {
  const opponentTurn = $('opponent-turn');
  const yourTurn = $('your-turn');
  const message = $('game-message');
  if (status.over) {
    const text = status.result === 'checkmate'
      ? `${status.winner === 'w' ? 'You win' : `${bots[selectedBot].name} wins`} by checkmate.`
      : status.result === 'stalemate' ? 'Draw by stalemate.' : `Draw (${status.reason.replaceAll('-', ' ')}).`;
    opponentTurn.textContent = status.winner === 'b' ? 'VICTORY' : status.winner === 'w' ? 'GAME OVER' : 'DRAW';
    yourTurn.textContent = 'GAME OVER';
    message.textContent = text;
  } else if (botThinking) {
    opponentTurn.textContent = 'THINKING…';
    yourTurn.textContent = 'BOT THINKING';
    message.textContent = `${bots[selectedBot].name} is considering a move…`;
  } else if (position.turn === 'b') {
    opponentTurn.textContent = 'YOUR MOVE';
    yourTurn.textContent = 'BOT TO MOVE';
    message.textContent = 'Your move is in. The bot is up next.';
  } else {
    opponentTurn.textContent = 'READY TO PLAY';
    yourTurn.innerHTML = '<span></span> YOUR TURN';
    message.textContent = status.inCheck ? 'Check! Find a safe move.' : 'Your move. Make it a good one!';
  }
}

function onSquareClick(square) {
  const status = currentStatus();
  if (botThinking || status.over || position.turn !== 'w' || pendingPromotion) return;
  const piece = position.board[square];
  if (selectedSquare) {
    const candidates = legalMoves(position, selectedSquare).filter(move => move.to === square);
    if (candidates.length) {
      if (candidates.some(move => move.promotion)) {
        showPromotion(candidates);
      } else {
        playMove(candidates[0]);
      }
      return;
    }
  }
  selectedSquare = piece?.[0] === 'w' ? square : null;
  renderBoard();
}

function showPromotion(candidates) {
  pendingPromotion = candidates;
  const options = $('promotion-options');
  options.innerHTML = ['Q', 'R', 'B', 'N'].map(type => {
    const move = candidates.find(candidate => candidate.promotion === type);
    return `<button type="button" data-promotion="${type}" aria-label="Promote to ${pieceNames[type]}">${pieceGlyphs[`w${type}`]}</button>`;
  }).join('');
  options.querySelectorAll('[data-promotion]').forEach(button => button.addEventListener('click', () => {
    const move = pendingPromotion?.find(candidate => candidate.promotion === button.dataset.promotion);
    $('promotion-dialog').hidden = true;
    pendingPromotion = null;
    if (move) playMove(move);
  }));
  $('promotion-dialog').hidden = false;
  options.querySelector('button')?.focus();
}

function playMove(move) {
  position = makeMove(position, move);
  lastMove = { from: move.from, to: move.to };
  history.push({ position, lastMove });
  selectedSquare = null;
  const status = currentStatus();
  renderBoard();
  if (!status.over && position.turn === 'b') scheduleBotMove();
}

function scheduleBotMove() {
  botThinking = true;
  const token = ++botTurnToken;
  renderBoard();
  window.setTimeout(() => {
    if (token !== botTurnToken || !botThinking) return;
    const move = getBotMove(position, botStrength(bots[selectedBot].rating));
    if (token !== botTurnToken) return;
    botThinking = false;
    if (move) {
      position = makeMove(position, move);
      lastMove = { from: move.from, to: move.to };
      history.push({ position, lastMove });
    }
    renderBoard();
  }, 30);
}

function newGame() {
  botTurnToken++;
  botThinking = false;
  pendingPromotion = null;
  $('promotion-dialog').hidden = true;
  position = createInitialPosition();
  history = [{ position, lastMove: null }];
  selectedSquare = null;
  lastMove = null;
  renderBoard();
}

function undoMove() {
  if (history.length <= 1) return;
  botTurnToken++;
  botThinking = false;
  pendingPromotion = null;
  $('promotion-dialog').hidden = true;
  // Undo the human move and bot reply together, or the pending human move alone.
  const plies = position.turn === 'w' ? 2 : 1;
  history.splice(Math.max(1, history.length - plies), plies);
  const previous = history[history.length - 1];
  position = previous.position;
  lastMove = previous.lastMove;
  selectedSquare = null;
  renderBoard();
}

$('undo').addEventListener('click', undoMove);
$('flip').addEventListener('click', () => { flipped = !flipped; renderBoard(); });
$('restart').addEventListener('click', newGame);
renderBots();
newGame();
