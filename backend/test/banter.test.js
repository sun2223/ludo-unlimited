import test from 'node:test';
import assert from 'node:assert/strict';
import { BanterEngine } from '../src/banter/BanterEngine.js';
import { DIALOGUES } from '../src/banter/dialogues.js';
import { RoomService } from '../src/rooms/service.js';
import { MemoryRepository } from '../src/storage/repository.js';
import { SlowTurnMonitor } from '../src/banter/SlowTurnMonitor.js';
import { newGame } from '@ludo/shared';
test('eight categories contain 16 distinct original lines; recent selections never repeat', () => {
  const engine = new BanterEngine({ choose: () => 0 }),
    room = { code: 'ABC234', matchNumber: 1, game: { version: 1 } };
  assert.equal(Object.keys(DIALOGUES).length, 8);
  for (const category of Object.keys(DIALOGUES)) {
    assert.equal(DIALOGUES[category].length, 16);
    assert.equal(new Set(DIALOGUES[category]).size, 16);
    const selected = Array.from(
      { length: 7 },
      () => engine.event(room, category, 'a', null, 100000).text,
    );
    assert.equal(new Set(selected).size, 7);
  }
});
function scenario(category) {
  const before = newGame([
    { id: 'a', color: 'coral' },
    { id: 'b', color: 'mint' },
  ]);
  let after = structuredClone(before),
    event = {
      id: '1:1',
      kind: 'roll',
      playerId: 'a',
      dice: category === 'six' ? 6 : 1,
      at: 100000,
    };
  after.version = 1;
  if (['capture', 'near_win', 'win'].includes(category)) {
    event = {
      ...event,
      kind: 'move',
      captures: category === 'capture' ? [{ playerId: 'b', tokenIndex: 0 }] : [],
    };
    if (category === 'near_win') after.players[0].tokens = [56, 56, 56, 45];
    if (category === 'win') {
      after.players[0].tokens = [56, 56, 56, 56];
      after.winnerId = 'a';
    }
  }
  const room = { code: 'ABC234', matchNumber: 1, game: after, lastEvent: event };
  return { before, room };
}
test('validated roll/capture/near-win/win outcomes produce categorized notices once', () => {
  const engine = new BanterEngine({ choose: () => 0 });
  for (const category of ['no_six', 'six', 'capture', 'near_win', 'win']) {
    const { before, room } = scenario(category);
    engine.onAction(room, before);
    assert.equal(room.social.autoEvents[0].category, category);
    if (category === 'capture') assert.equal(room.social.autoEvents[1].category, 'loss');
    engine.onAction(room, before);
    assert.equal(room.social.autoEvents.length, 0);
  }
});
test('cooldowns suppress noise without changing the committed game and wins remain visible', () => {
  const engine = new BanterEngine({ choose: () => 0 }),
    { before, room } = scenario('no_six');
  engine.onAction(room, before);
  const saved = structuredClone(room.game);
  room.lastEvent = { ...room.lastEvent, id: '1:2', at: 100001 };
  engine.onAction(room, before);
  assert.equal(room.social.autoEvents.length, 0);
  assert.deepEqual(room.game, saved);
  room.game.winnerId = 'a';
  room.lastEvent.id = '1:3';
  engine.onAction(room, before);
  assert.equal(room.social.autoEvents[0].category, 'win');
});
test('invalid and failed-storage actions do not commit banter; old snapshots initialize lazily', async () => {
  const repository = new MemoryRepository(),
    rooms = new RoomService(repository, { die: () => 6 });
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'a');
  const b = await rooms.join(a.room.code, 'Bob');
  rooms.connect(b.session, 'b');
  await rooms.start(a.session);
  await assert.rejects(() => rooms.play(b.session, { version: 0, matchNumber: 1 }, 'roll'));
  assert.deepEqual((await rooms.get(a.room.code)).social.autoEvents, []);
  repository.save = async () => {
    throw new Error('disk unavailable');
  };
  await assert.rejects(() => rooms.play(a.session, { version: 0, matchNumber: 1 }, 'roll'));
  assert.equal((await rooms.get(a.room.code)).game.version, 0);
});
test('slow-turn reminder is once per live turn, skips offline players and never mutates gameplay', async () => {
  let now = 100000;
  const rooms = new RoomService(new MemoryRepository(), {
    now: () => now,
    banter: new BanterEngine({ config: { SLOW_TURN_MS: 100 }, choose: () => 0 }),
  });
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'a');
  const b = await rooms.join(a.room.code, 'Bob');
  rooms.connect(b.session, 'b');
  const room = await rooms.start(a.session),
    events = [];
  const io = { to: (code) => ({ emit: (name, event) => events.push({ code, name, event }) }) };
  const monitor = new SlowTurnMonitor(io, rooms);
  try {
    monitor.observe(room);
    rooms.disconnect('a');
    now += 101;
    await monitor.scan();
    assert.equal(events.length, 0);
    rooms.connect(a.session, 'back');
    now += 101;
    await monitor.scan();
    await monitor.scan();
    assert.equal(events.length, 1);
    assert.equal(events[0].event.category, 'slow');
    assert.equal((await rooms.get(room.code)).game.version, 0);
  } finally {
    monitor.close();
  }
});

test('optional banter failures do not reject valid game actions', async () => {
  const banter = new BanterEngine();
  banter.onAction = () => {
    throw new Error('synthetic banter failure');
  };
  const rooms = new RoomService(new MemoryRepository(), { die: () => 6, banter });
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'a');
  const b = await rooms.join(a.room.code, 'Bob');
  rooms.connect(b.session, 'b');
  await rooms.start(a.session);
  const room = await rooms.play(a.session, { version: 0, matchNumber: 1 }, 'roll');
  assert.equal(room.game.dice, 6);
  assert.equal(room.game.version, 1);
  assert.deepEqual(room.social.autoEvents, []);
});
