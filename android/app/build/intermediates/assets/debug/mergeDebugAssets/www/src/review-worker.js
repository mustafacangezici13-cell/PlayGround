import { analyzeGame } from './chess.js';

self.addEventListener('message', ({ data }) => {
  const result = analyzeGame(data.plies, (current, total) => {
    self.postMessage({ type: 'progress', current, total, token: data.token });
  });
  self.postMessage({ type: 'complete', result, token: data.token });
});
