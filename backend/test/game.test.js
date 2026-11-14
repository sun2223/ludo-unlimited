import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app.js';
import { MemoryRepository } from '../src/storage/repository.js';
const emit = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
test('authoritative turns, stale request rejection, chat isolation, reconnect and unlimited rematches', async (t) => {
  const repository = new MemoryRepository(),
    runtime = createApplication({ repository, gameOptions: { die: () => 6 } });
  await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await runtime.close();
  });
  async function client() {
    const s = io('http://127.0.0.1:' + runtime.server.address().port, { forceNew: true });
    clients.push(s);
    await new Promise((resolve) => s.on('connect', resolve));
    return s;
  }
  const a = await client(),
    b = await client(),
    outsider = await client();
  const created = await emit(a, 'room:create', { name: 'Alice' });
  assert.equal((await emit(a, 'game:start', {})).ok, false);
  const bob = await emit(b, 'room:join', { code: created.room.code, name: 'Bob' });
  assert.equal((await emit(b, 'game:start', {})).ok, false);
  let started = await emit(a, 'game:start', {});
  assert.equal(started.ok, true);
  const version = { version: 0, matchNumber: 1 };
  assert.equal((await emit(b, 'game:roll', version)).ok, false);
  const rolled = await emit(a, 'game:roll', { ...version, value: 1 });
  assert.equal(rolled.room.game.dice, 6);
  assert.equal((await emit(a, 'game:roll', version)).ok, false);
  assert.equal(
    (await emit(a, 'game:move', { version: 1, matchNumber: 1, tokenIndex: 7 })).ok,
    false,
  );
  assert.equal(
    (await emit(a, 'game:move', { version: 1, matchNumber: 1, tokenIndex: 0 })).room.game.players[0]
      .tokens[0],
    0,
  );
  assert.equal((await emit(outsider, 'chat:send', { text: 'intrusion' })).ok, false);
  const message = new Promise((resolve) => b.once('chat:message', resolve));
  await emit(a, 'chat:send', { text: '<script>hello</script>' });
  assert.equal((await message).text, '<script>hello</script>');
  assert.equal(
    (await emit(outsider, 'room:join', { code: created.room.code, name: 'Late' })).ok,
    false,
  );
  const otherRoom = await emit(outsider, 'room:create', { name: 'Other table' });
  assert.equal(otherRoom.ok, true);
  let leaked = false;
  outsider.once('chat:message', () => {
    leaked = true;
  });
  await emit(b, 'chat:send', { text: 'Only for this table.' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(leaked, false);
  b.disconnect();
  const rejoined = await client();
  const resumed = await emit(rejoined, 'room:resume', bob.session);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.room.game.players[0].tokens[0], 0);
  assert.equal(resumed.room.chat.length, 2);
  // Seed a finished snapshot to exercise the rematch boundary without thousands of network rolls.
  for (let i = 0; i < 3; i++) {
    const room = await repository.get(created.room.code);
    room.game.status = 'finished';
    await repository.save(room);
    started = await emit(a, 'game:start', {});
    assert.equal(started.ok, true);
    assert.equal(started.room.matchNumber, i + 2);
    assert.deepEqual(started.room.game.players[0].tokens, [-1, -1, -1, -1]);
  }
});
