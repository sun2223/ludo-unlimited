import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../src/rooms/service.js';
import { MemoryRepository } from '../src/storage/repository.js';
test('disconnected turns can only be skipped by the current host after 60 seconds; rejoin keeps tokens', async () => {
  let now = 100000;
  const rooms = new RoomService(new MemoryRepository(), { now: () => now, die: () => 6 });
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'a');
  const b = await rooms.join(a.room.code, 'Bob');
  rooms.connect(b.session, 'b');
  await rooms.start(a.session);
  await rooms.play(a.session, { version: 0, matchNumber: 1 }, 'roll');
  rooms.disconnect('a');
  assert.equal(rooms.host(await rooms.get(a.room.code)), b.session.playerId);
  await assert.rejects(
    () => rooms.play(b.session, { version: 1, matchNumber: 1 }, 'skip'),
    /60 seconds/,
  );
  now += 60001;
  const skipped = await rooms.play(b.session, { version: 1, matchNumber: 1 }, 'skip');
  assert.equal(skipped.game.turn, 1);
  const resumed = await rooms.resume(a.session);
  rooms.connect(resumed.session, 'a2');
  assert.equal(rooms.host(resumed.room), a.session.playerId);
  assert.equal(resumed.room.game.phase, 'roll');
});
test('failed persistence does not change the previously committed room', async () => {
  const repository = new MemoryRepository(),
    rooms = new RoomService(repository),
    created = await rooms.create('Alice');
  repository.save = async () => {
    throw new Error('Storage unavailable');
  };
  await assert.rejects(() => rooms.join(created.room.code, 'Bob'), /Storage/);
  assert.equal((await repository.get(created.room.code)).players.length, 1);
});
test('parallel room joins serialize without overfilling', async () => {
  const rooms = new RoomService(new MemoryRepository()),
    created = await rooms.create('Alice');
  const results = await Promise.allSettled(
    ['Bob', 'Cara', 'Dan', 'Eve', 'Fred'].map((name) => rooms.join(created.room.code, name)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal((await rooms.get(created.room.code)).players.length, 4);
});
