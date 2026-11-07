import { createInitialPosition, legalMoves, makeMove, getBotMove, getStatus, isInCheck, isSquareAttacked, analyzeGame } from './src/chess.js';

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
  { name: 'Vera', rating: 2900, personality: 'The relentless analyst', description: 'No free tempi, no easy wins', emoji: '🧠', image: 'victor' },
  { name: 'Atlas', rating: 3300, personality: 'The engine room', description: 'A deep-searching machine', emoji: '⚙️', image: 'magnus' },
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
let audioContext = null;
let soundEnabled = false;
let reviewWorker = null;
let reviewToken = 0;
try {
  if (typeof Worker !== 'undefined') {
    reviewWorker = new Worker('./src/review-worker.js', { type: 'module' });
    reviewWorker.onmessage = ({ data }) => {
      if (data.token !== reviewToken) return;
      if (data.type === 'progress') $('review-summary').textContent = `Analyzing moves… ${data.current}/${data.total}`;
      if (data.type === 'complete') renderReview(data.result);
    };
  }
} catch { reviewWorker = null; }

const pieceGlyphs = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};
const pieceNames = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
const files = 'abcdefgh';
let voiceEnabled = false;
let engineWorker = null;
try {
  if (typeof Worker !== 'undefined') {
    engineWorker = new Worker('./src/bot-worker.js', { type: 'module' });
    engineWorker.onmessage = ({ data }) => completeBotTurn(data.token, data.move);
  }
} catch { engineWorker = null; }

const dialogue = {
  start: ["A fresh board. Show me what you've prepared.", "Glad you made it. Let's play something memorable.", "Your move. I'll be watching the whole board.", "Let's see if your opening is as good as your confidence."],
  thinking: ["Interesting. Let me look a little closer.", "I have a plan… I think.", "No rush. The board isn't going anywhere.", "That changes things. Give me a moment."],
  capture: ["A bold capture. I was hoping you'd notice that one.", "Well played. The position just got sharper.", "You took it—now let's see what that costs."],
  check: ["Check! That's a real question. Let me find the answer.", "Nice pressure. You have my attention now.", "A check already? All right, let's be precise."],
  reply: ["Your move. I'm not done yet.", "Let's keep the pressure on.", "A small step, but every square matters.", "I like where this is going."],
  botCapture: ["I'll take that, thank you.", "That piece was looking a little lonely.", "A fair trade? We'll see."],
  botCheck: ["Check. Your turn to find the way out.", "Let's see how you handle a little pressure.", "The king is in the conversation now."],
  win: ["That's checkmate. A lovely game—rematch?", "Well fought, but this one is mine.", "Checkmate. I hope you enjoyed the chase."],
  loss: ["You got me. That was a terrific game.", "Checkmate. I owe you a rematch.", "Nicely done. You earned that one."],
  draw: ["A draw feels fair. Shall we try again?", "Neither of us blinked. Good game.", "Dead even. That was fun."],
};
function setDialogue(kind, speak = true) {
  const lines = dialogue[kind] || dialogue.reply;
  const text = lines[Math.floor(Math.random() * lines.length)];
  $('bot-dialogue').textContent = text;
  if (speak && voiceEnabled && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.94;
    window.speechSynthesis.speak(utterance);
  }
}

function botStrength(rating) {
  return Math.max(1, Math.min(7, Math.round(1 + (rating - 200) * 6 / 3100)));
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
  const threatened = new Set(Object.keys(position.board).filter(square => {
    const piece = position.board[square];
    return piece[1] !== 'K' && isSquareAttacked(position, square, piece[0] === 'w' ? 'b' : 'w');
  }));
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
    if (threatened.has(square)) classes.push('threatened');
    const isTarget = targets.has(square);
    const coords = `${columnIndex === 0 ? `<span class="coord rank">${rank + 1}</span>` : ''}${rowIndex === 7 ? `<span class="coord file">${file}</span>` : ''}`;
    return `<button type="button" class="${classes.join(' ')}" data-square="${square}" aria-label="${square}${piece ? `, ${piece[0] === 'w' ? 'White' : 'Black'} ${pieceNames[piece[1]]}` : ''}${isTarget ? ', legal move' : ''}${threatened.has(square) ? ', under threat' : ''}" ${botThinking || status.over ? 'disabled' : ''}>${piece ? `<span class="piece ${piece[0] === 'w' ? 'white' : 'black'}">${pieceGlyphs[piece]}</span>` : ''}${isTarget ? `<span class="move-dot ${piece ? 'capture' : ''}"></span>` : ''}${threatened.has(square) ? '<span class="threat-mark" aria-hidden="true">!</span>' : ''}${coords}</button>`;
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

function playMoveSound(check = false) {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    const context = audioContext;
    const play = () => {
      const now = context.currentTime;
      const notes = check ? [520, 760] : [230];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * 0.11;
        oscillator.type = check ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(check ? 0.12 : 0.08, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + (check ? 0.19 : 0.1));
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      });
    };
    if (context.state === 'suspended') {
      context.resume().then(play).catch(() => {});
      return;
    }
    play();
  } catch { /* Audio is an optional browser enhancement. */ }
}

function showGameOver(status) {
  const summary = status.result === 'checkmate'
    ? `${status.winner === 'w' ? 'You win' : `${bots[selectedBot].name} wins`} by checkmate.`
    : status.result === 'stalemate' ? 'The game is a draw by stalemate.' : `The game is a draw (${(status.reason || status.result).replaceAll('-', ' ')}).`;
  $('game-over-title').textContent = status.winner === 'w' ? 'A wonderful win!' : status.winner === 'b' ? 'Game over' : 'A hard-fought draw';
  $('game-over-summary').textContent = summary;
  $('game-over').hidden = false;
  $('open-review').focus();
}

function openReview() {
  $('game-over').hidden = true;
  $('review-dialog').hidden = false;
  $('review-summary').textContent = 'Analyzing moves…';
  $('review-stats').innerHTML = '';
  $('advantage-chart').innerHTML = '';
  $('review-moves').innerHTML = '';
  const token = ++reviewToken;
  const plies = history.slice(1).map(entry => ({ position: entry.before, move: entry.move }));
  if (reviewWorker) reviewWorker.postMessage({ plies, token });
  else window.setTimeout(() => renderReview(analyzeGame(plies), token), 20);
}

function renderReview(result, token = reviewToken) {
  if (token !== reviewToken) return;
  $('review-summary').textContent = `${result.moves.length} half-moves reviewed. Grades and accuracy are local estimates, not official engine analysis.`;
  $('review-stats').innerHTML = `<div><span>You · White</span><strong>${result.accuracy.white}%</strong><small>accuracy</small></div><div><span>${bots[selectedBot].name} · Black</span><strong>${result.accuracy.black}%</strong><small>accuracy</small></div>`;
  const bookCount = result.moves.filter(entry => entry.book).length;
  $('opening-insight').innerHTML = `<strong>${result.opening ? `📖 ${result.opening}` : 'Opening & principles'}</strong><p>${result.opening ? `${bookCount} move${bookCount === 1 ? '' : 's'} followed a supported opening line.` : 'No supported opening line detected; sound development, king safety, and central control still matter.'} Move notes highlight these general principles, not a full positional engine evaluation.</p>`;
  const scores = result.scores;
  const width = 640, height = 150, mid = height / 2;
  const maxScore = Math.max(300, ...scores.map(point => Math.abs(point.score)));
  const points = scores.map((point, index) => {
    const x = scores.length < 2 ? width / 2 : 12 + index * (width - 24) / (scores.length - 1);
    const y = mid - Math.max(-1, Math.min(1, point.score / maxScore)) * (mid - 12);
    return `${x},${y}`;
  }).join(' ');
  const scoreLabels = scores.map(point => `${point.ply === 0 ? 'Start' : `Move ${point.ply}`} ${point.score >= 0 ? '+' : ''}${(point.score / 100).toFixed(1)}`).join(', ');
  $('advantage-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="White advantage from start to finish: ${scoreLabels}"><line x1="0" y1="${mid}" x2="${width}" y2="${mid}" class="chart-zero"/><polyline points="${points}" class="chart-line"/>${scores.map((point,index)=>{const x=scores.length<2?width/2:12+index*(width-24)/(scores.length-1);const y=mid-Math.max(-1,Math.min(1,point.score/maxScore))*(mid-12);return `<circle cx="${x}" cy="${y}" r="3" class="chart-point"/>`;}).join('')}</svg><div class="chart-ends"><span>START</span><span>WHITE ADVANTAGE <b>+</b> / BLACK ADVANTAGE <b>−</b></span><span>FINISH</span></div>`;
  $('review-moves').innerHTML = result.moves.length ? `<div class="move-review-head"><span>MOVE</span><span>PLAYED</span><span>GRADE</span><span>BEST ALTERNATIVE &amp; NOTES</span></div>${result.moves.map((entry,index)=>{const symbol=entry.label==='Best'?'<span class="grade-mark best-mark" aria-label="Best move" title="Best move">★</span>':['Inaccuracy','Mistake','Blunder'].includes(entry.label)?'<span class="grade-mark bad-mark" aria-label="Weak move" title="Weak move">!</span>':'';const center=entry.centerGain?` · Center ${entry.centerGain>0?'+':''}${entry.centerGain}`:'';return `<div class="move-review-row"><span>${Math.floor(index / 2) + 1}${entry.side === 'b' ? '…' : '.'} <small>${entry.side === 'w' ? 'You' : bots[selectedBot].name}</small></span><strong>${entry.book?'<span class="book-mark" aria-label="Opening-book move" title="Opening-book move">♧</span>':''}${entry.move}</strong><span class="grade grade-${entry.label.toLowerCase()}">${symbol}${entry.label}</span><span>${entry.best}<small class="review-note">${entry.principle}${center}</small></span></div>`;}).join('')}` : '<p class="empty-review">No moves to review yet.</p>';
}

function playMove(move) {
  const before = position;
  const captured = position.board[move.to] || (move.to === position.enPassant ? 'bP' : null);
  position = makeMove(position, move);
  lastMove = { from: move.from, to: move.to };
  history.push({ position, lastMove, before, move });
  selectedSquare = null;
  const status = currentStatus();
  playMoveSound(status.inCheck);
  renderBoard();
  if (status.over) {
    setDialogue(status.winner === 'w' ? 'win' : status.winner === 'b' ? 'loss' : 'draw');
    showGameOver(status);
  }
  else if (status.inCheck) setDialogue('check');
  else if (captured) setDialogue('capture');
  else setDialogue('thinking', false);
  if (!status.over && position.turn === 'b') scheduleBotMove();
}

function completeBotTurn(token, move) {
  if (token !== botTurnToken || !botThinking) return;
  botThinking = false;
  let captured = false;
  if (move) {
    const before = position;
    captured = Boolean(position.board[move.to] || (move.to === position.enPassant && position.board[move.from]?.[1] === 'P'));
    position = makeMove(position, move);
    lastMove = { from: move.from, to: move.to };
    history.push({ position, lastMove, before, move });
  }
  const status = currentStatus();
  if (move) playMoveSound(status.inCheck);
  renderBoard();
  if (status.over) {
    setDialogue(status.winner === 'b' ? 'win' : status.winner === 'w' ? 'loss' : 'draw');
    showGameOver(status);
  }
  else if (status.inCheck) setDialogue('botCheck');
  else if (captured) setDialogue('botCapture');
  else setDialogue('reply');
}

function scheduleBotMove() {
  botThinking = true;
  const token = ++botTurnToken;
  renderBoard();
  setDialogue('thinking', false);
  if (engineWorker) {
    engineWorker.postMessage({ position, strength: botStrength(bots[selectedBot].rating), history: history.slice(1).map(entry => entry.move), token });
    return;
  }
  window.setTimeout(() => {
    if (token !== botTurnToken || !botThinking) return;
    completeBotTurn(token, getBotMove(position, botStrength(bots[selectedBot].rating), { history: history.slice(1).map(entry => entry.move) }));
  }, 30);
}

function newGame() {
  $('game-over').hidden = true;
  $('review-dialog').hidden = true;
  reviewToken++;
  botTurnToken++;
  botThinking = false;
  pendingPromotion = null;
  $('promotion-dialog').hidden = true;
  position = createInitialPosition();
  history = [{ position, lastMove: null }];
  selectedSquare = null;
  lastMove = null;
  renderBoard();
  setDialogue('start', false);
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
$('open-review').addEventListener('click', openReview);
$('close-review').addEventListener('click', () => {
  $('review-dialog').hidden = true;
  if (currentStatus().over) $('game-over').hidden = false;
});
$('close-game-over').addEventListener('click', () => { $('game-over').hidden = true; });
$('flip').addEventListener('click', () => { flipped = !flipped; renderBoard(); });
$('restart').addEventListener('click', newGame);
$('sound-toggle').addEventListener('click', event => {
  soundEnabled = !soundEnabled;
  const button = event.currentTarget;
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.innerHTML = `${soundEnabled ? '🔊' : '🔇'} <span>Sound ${soundEnabled ? 'on' : 'off'}</span>`;
  button.title = soundEnabled ? 'Turn move sounds off' : 'Turn move sounds on';
  if (soundEnabled) playMoveSound();
});
$('voice-toggle').addEventListener('click', event => {
  voiceEnabled = !voiceEnabled;
  const button = event.currentTarget;
  button.setAttribute('aria-pressed', String(voiceEnabled));
  button.innerHTML = `${voiceEnabled ? '🔊' : '🔇'} <span>Voice ${voiceEnabled ? 'on' : 'off'}</span>`;
  if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (voiceEnabled) setDialogue('start');
});
if (!('speechSynthesis' in window)) {
  $('voice-toggle').disabled = true;
  $('voice-toggle').title = 'Spoken commentary is not available in this browser';
}
renderBots();
newGame();
