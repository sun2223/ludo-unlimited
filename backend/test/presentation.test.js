import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../src/rooms/service.js';
import { MemoryRepository } from '../src/storage/repository.js';
test('only validated moves attach start/end metadata and commit it with the authoritative state', async () => {
  const rooms = new RoomService(new MemoryRepository(), { die: () => 6, now: () => 1234 });
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'a');
  const b = await rooms.join(a.room.code, 'Bob');
  rooms.connect(b.session, 'b');
  await rooms.start(a.session);
  const rolled = await rooms.play(a.session, { version: 0, matchNumber: 1 }, 'roll');
  assert.equal(rolled.lastEvent.kind, 'roll');
  await assert.rejects(() =>
    rooms.play(a.session, { version: 1, matchNumber: 1, tokenIndex: 8 }, 'move'),
  );
  assert.equal((await rooms.get(a.room.code)).lastEvent.kind, 'roll');
  const moved = await rooms.play(a.session, { version: 1, matchNumber: 1, tokenIndex: 0 }, 'move');
  assert.deepEqual([moved.lastEvent.from, moved.lastEvent.to, moved.lastEvent.dice], [-1, 0, 6]);
  assert.equal(moved.lastEvent.at, 1234);
  assert.equal(rooms.publicRoom(moved).serverTime, 1234);
});
