import { getBotMove } from './chess.js';

self.addEventListener('message', ({ data }) => {
  const { position, strength, history, token } = data;
  const move = getBotMove(position, strength, { history });
  self.postMessage({ token, move });
});
