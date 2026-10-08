'use strict';
const game = require('../js/game');
const rules = require('../js/rules');
const brute = require('./placement-reference');
const s = game.createGame();
for (let i = 0; i < 32 && s.status === 'playing'; i++) {
  const actions = rules.allLegalActions(s, s.turn);
  game.applyAction(s, actions[(i * 73) % actions.length]);
}
const sample = () => s.remaining[s.turn].flatMap(id => rules.legalPlacements(s, s.turn, id));
const reference = () => s.remaining[s.turn].flatMap(id => brute(s, s.turn, id));
const measure = (fn) => {
  fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < 10; i++) fn();
  return Number(process.hrtime.bigint() - start) / 1e6 / 10;
};
if (JSON.stringify(sample()) !== JSON.stringify(reference())) throw Error('benchmark result mismatch');
const oldMs = measure(reference), newMs = measure(sample);
console.log(JSON.stringify({
  moves: s.moves.length,
  legal: sample().length,
  bruteMs: oldMs,
  candidateMs: newMs,
  speedup: oldMs / newMs
}));
