import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION, COLORS, newGame, moveToken, movementPath, coordinates } from '@ludo/shared';
import { PresentationController } from '../src/animation/PresentationController.js';
function harness() {
  let time = 1000,
    nextId = 0;
  const tasks = new Map(),
    frames = [],
    cues = [];
  const controller = new PresentationController({
    onFrame: (f) => frames.push(f),
    onCue: (c) => cues.push(c),
    now: () => time,
    schedule: (fn, ms) => {
      const id = ++nextId;
      tasks.set(id, { fn, at: time + ms });
      return id;
    },
    cancel: (id) => tasks.delete(id),
  });
  function tick(ms) {
    const until = time + ms;
    while (true) {
      const entry = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > until) break;
      tasks.delete(entry[0]);
      time = entry[1].at;
      entry[1].fn();
    }
    time = until;
  }
  return { controller, frames, cues, tick };
}
function move(from, dice, color = 'coral') {
  const game = newGame([
    { id: 'a', color },
    { id: 'b', color: color === 'mint' ? 'gold' : 'mint' },
  ]);
  game.players[0].tokens[0] = from;
  game.phase = 'move';
  game.dice = dice;
  const previous = { code: 'ABC234', matchNumber: 1, game, serverTime: 1000 };
  const next = {
    ...previous,
    game: moveToken(game, 'a', 0),
    lastEvent: {
      id: '1:1',
      kind: 'move',
      playerId: 'a',
      color,
      tokenIndex: 0,
      from,
      to: from < 0 ? 0 : from + dice,
      fromVersion: 0,
      toVersion: 1,
      at: 1000,
      captures: [],
    },
  };
  return { previous, next };
}
for (const dice of [1, 3, 6])
  test(`dice ${dice} produces exactly ${dice} separate timed steps and one landing`, () => {
    const h = harness(),
      { previous, next } = move(2, dice);
    h.controller.receive(previous);
    h.controller.receive(next);
    assert.equal(h.controller.locked, true);
    h.tick(dice * ANIMATION.STEP_MS + ANIMATION.LAND_MS);
    assert.deepEqual(
      h.frames.filter((f) => f.phase === 'moving').map((f) => f.game.players[0].tokens[0]),
      Array.from({ length: dice }, (_, i) => 3 + i),
    );
    assert.equal(h.cues.filter((c) => c === 'step').length, dice);
    assert.equal(h.frames.filter((f) => f.phase === 'landing').length, 1);
    assert.equal(h.controller.locked, false);
    assert.deepEqual(h.controller.frame.game, next.game);
  });
test('all colors follow the engine geometry around corners and into home', () => {
  for (const color of COLORS)
    for (const from of [3, 10, 16, 23, 29, 36, 42, 48, 50, 53]) {
      const to = Math.min(56, from + 3),
        path = movementPath(color, from, to);
      assert.deepEqual(
        path.map((p) => p.coords),
        Array.from({ length: to - from }, (_, i) => coordinates(color, from + i + 1)),
      );
    }
  assert.deepEqual(
    movementPath('coral', -1, 0).map((p) => p.progress),
    [0],
  );
});
test('ACKs, chat/presence updates and duplicate events never restart a move', () => {
  const h = harness(),
    { previous, next } = move(2, 3);
  h.controller.receive(previous);
  h.controller.receive(next);
  h.tick(100);
  h.controller.receive({ ...next, revision: 99 });
  h.controller.receive(next);
  h.tick(1000);
  assert.equal(h.frames.filter((f) => f.phase === 'moving').length, 3);
});
test('refresh/reconnect, version gaps, stale timestamps and reduced motion snap to the committed board', () => {
  for (const mode of ['refresh', 'reconnect', 'gap', 'late', 'reduced']) {
    const h = harness(),
      { previous, next } = move(2, 6);
    if (mode !== 'refresh') h.controller.receive(previous);
    const incoming =
      mode === 'gap'
        ? { ...next, lastEvent: { ...next.lastEvent, fromVersion: 9 } }
        : mode === 'late'
          ? { ...next, serverTime: 10000 }
          : next;
    h.controller.receive(incoming, {
      live: mode !== 'reconnect',
      reducedMotion: mode === 'reduced',
    });
    h.tick(5000);
    assert.equal(h.frames.filter((f) => f.phase === 'moving').length, 0, mode);
    assert.deepEqual(h.controller.frame.game, next.game);
  }
});
test('new actions queue rather than overlap; disposal cancels all scheduled hops', () => {
  const h = harness(),
    { previous, next } = move(2, 3);
  h.controller.receive(previous);
  h.controller.receive(next);
  const later = {
    ...next,
    game: { ...next.game, version: 2, lastRoll: 6 },
    lastEvent: { id: '1:2', kind: 'roll', fromVersion: 1, toVersion: 2, at: 1100 },
    serverTime: 1100,
  };
  h.tick(100);
  h.controller.receive(later);
  assert.equal(h.controller.frame.phase, 'moving');
  h.tick(50);
  h.controller.dispose();
  const count = h.frames.length;
  h.tick(10000);
  assert.equal(h.frames.length, count);
});

test('roll, six, capture, turn and win cues are tied to completed live transitions', () => {
  const h = harness(),
    { previous, next } = move(2, 3);
  h.controller.receive({ ...previous, game: { ...previous.game, phase: 'roll', dice: null } });
  h.controller.receive({
    ...previous,
    game: { ...previous.game, version: 1, lastRoll: 6 },
    lastEvent: { id: '1:1', kind: 'roll', fromVersion: 0, toVersion: 1, at: 1000 },
  });
  assert.deepEqual(h.cues, ['dice']);
  h.tick(ANIMATION.DICE_MS);
  assert.deepEqual(h.cues, ['dice', 'six']);
  const winner = {
    ...next,
    game: { ...next.game, version: 2, winnerId: 'a', status: 'finished' },
    lastEvent: {
      ...next.lastEvent,
      id: '1:2',
      fromVersion: 1,
      toVersion: 2,
      captures: [{ playerId: 'b', tokenIndex: 0 }],
    },
  };
  h.controller.receive(winner);
  h.tick(2000);
  assert.equal(h.cues.filter((c) => c === 'capture').length, 1);
  assert.equal(h.cues.filter((c) => c === 'win').length, 1);
  const other = harness();
  other.controller.receive(previous);
  other.controller.receive(next);
  other.tick(2000);
  assert.ok(other.cues.includes('turn'));
});
