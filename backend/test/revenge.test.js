import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../src/rooms/service.js';
import { MemoryRepository } from '../src/storage/repository.js';
import { BanterEngine } from '../src/banter/BanterEngine.js';
test('real captures persist pair statistics, a subsequent counter-capture triggers revenge, and rematches reset debts', async () => {
  const dice = [2, 1, 6, 2],
    repository = new MemoryRepository(),
    rooms = new RoomService(repository, {
      die: () => dice.shift(),
      banter: new BanterEngine({
        config: { AUTO_COOLDOWN_MS: 0, CATEGORY_COOLDOWN_MS: 0 },
        choose: () => 0,
      }),
    });
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'a');
  const b = await rooms.join(a.room.code, 'Bob');
  rooms.connect(b.session, 'b');
  await rooms.start(a.session);
  let seed = await rooms.get(a.room.code);
  seed.game.players[0].tokens[0] = 12;
  seed.game.players[1].tokens[0] = 1;
  await repository.save(seed);
  async function act(session, action) {
    const room = await rooms.get(a.room.code);
    return rooms.play(
      session,
      { version: room.game.version, matchNumber: room.matchNumber, tokenIndex: 0 },
      action,
    );
  }
  await act(a.session, 'roll');
  let room = await act(a.session, 'move');
  assert.equal(room.social.captures[a.session.playerId][b.session.playerId], 1);
  assert.deepEqual(
    room.social.autoEvents.map((e) => e.category),
    ['capture', 'loss'],
  );
  await act(a.session, 'roll');
  await act(a.session, 'move');
  await act(b.session, 'roll');
  await act(b.session, 'move');
  await act(b.session, 'roll');
  room = await act(b.session, 'move');
  assert.equal(room.social.captures[b.session.playerId][a.session.playerId], 1);
  assert.equal(room.social.revengeCounts[b.session.playerId], 1);
  assert.equal(room.social.autoEvents[0].category, 'revenge');
  assert.equal(room.social.autoEvents[0].targetId, a.session.playerId);
  const saved = structuredClone(room.social.captures);
  await assert.rejects(() =>
    rooms.play(b.session, { version: 0, matchNumber: 1, tokenIndex: 0 }, 'move'),
  );
  assert.deepEqual((await rooms.get(room.code)).social.captures, saved);
  room.game.status = 'finished';
  await repository.save(room);
  room = await rooms.start(a.session);
  assert.equal(room.matchNumber, 2);
  assert.equal(room.social.captures, undefined);
  assert.equal(room.social.debts, undefined);
});
