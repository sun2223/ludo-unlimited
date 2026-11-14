import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS,
  TRACK,
  SAFE,
  FINISH,
  coordinates,
  newGame,
  legalMoves,
  rollDice,
  moveToken,
  square,
} from '../index.js';
const players = COLORS.map((color, i) => ({ id: String(i), color }));
const setup = () => newGame(players);
test('geometry: 52 unique loop squares, four lanes and eight safe zones', () => {
  assert.equal(new Set(TRACK.map(String)).size, 52);
  assert.equal(SAFE.length, 8);
  for (const color of COLORS) {
    assert.equal(square(color, 51), null);
    assert.ok(coordinates(color, FINISH));
  }
});
test('six releases a token and grants an extra roll without mutating input', () => {
  const initial = setup(),
    rolled = rollDice(initial, '0', 6);
  assert.deepEqual(legalMoves(rolled), [0, 1, 2, 3]);
  const moved = moveToken(rolled, '0', 0);
  assert.equal(moved.players[0].tokens[0], 0);
  assert.equal(moved.turn, 0);
  assert.equal(moved.phase, 'roll');
  assert.equal(initial.players[0].tokens[0], -1);
});
test('no moves passes turn, wrong turns and invalid phases are rejected', () => {
  const game = setup();
  assert.throws(() => rollDice(game, '1', 6));
  assert.throws(() => moveToken(game, '0', 0));
  assert.equal(rollDice(game, '0', 2).turn, 1);
  assert.throws(() => rollDice(game, '0', 9));
  assert.throws(() => rollDice(rollDice(game, '0', 6), '0', 6));
});
test('third consecutive six forfeits the turn', () => {
  let game = setup();
  for (let i = 0; i < 2; i++) game = moveToken(rollDice(game, '0', 6), '0', 0);
  game = rollDice(game, '0', 6);
  assert.equal(game.turn, 1);
  assert.equal(game.sixes, 0);
});
test('captures return an opponent to the yard and give another roll', () => {
  const game = setup();
  game.players[0].tokens[0] = 12;
  game.players[1].tokens[0] = 1;
  const result = moveToken(rollDice(game, '0', 2), '0', 0);
  assert.equal(result.players[1].tokens[0], -1);
  assert.equal(result.turn, 0);
});
test('safe squares protect opposing tokens', () => {
  const game = setup();
  game.players[0].tokens[0] = 12;
  game.players[1].tokens[0] = 0;
  const result = moveToken(rollDice(game, '0', 1), '0', 0);
  assert.equal(result.players[1].tokens[0], 0);
  assert.equal(result.turn, 1);
});
test('blockades prevent landing and passing but can split', () => {
  const game = setup();
  game.players[0].tokens[0] = 12;
  game.players[1].tokens = [1, 1, -1, -1];
  assert.equal(rollDice(game, '0', 3).turn, 1);
  game.turn = 1;
  assert.deepEqual(legalMoves(rollDice(game, '1', 1)), [0, 1]);
});
test('exact roll is required to finish; all four home wins', () => {
  const game = setup();
  game.players[0].tokens = [56, 56, 56, 55];
  assert.equal(rollDice(game, '0', 2).turn, 1);
  const result = moveToken(rollDice(game, '0', 1), '0', 3);
  assert.equal(result.winnerId, '0');
  assert.equal(result.status, 'finished');
  assert.throws(() => rollDice(result, '0', 1));
});
test('home lane does not capture similarly positioned tokens of another color', () => {
  const game = setup();
  game.players[0].tokens[0] = 50;
  game.players[1].tokens[0] = 51;
  const result = moveToken(rollDice(game, '0', 1), '0', 0);
  assert.equal(result.players[1].tokens[0], 51);
});
test('deterministic simulation reaches a winner while preserving token invariants', () => {
  let game = setup(),
    seed = 42;
  for (let i = 0; i < 30000 && game.status === 'active'; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const id = game.players[game.turn].id;
    game = rollDice(game, id, (seed % 6) + 1);
    if (game.phase === 'move')
      game = moveToken(game, id, legalMoves(game)[(seed >>> 4) % legalMoves(game).length]);
    for (const p of game.players)
      assert.ok(p.tokens.every((pos) => Number.isInteger(pos) && pos >= -1 && pos <= FINISH));
  }
  assert.equal(game.status, 'finished');
});
