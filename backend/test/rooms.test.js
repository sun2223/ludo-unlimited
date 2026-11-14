import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app.js';
import { MemoryRepository } from '../src/storage/repository.js';
export const emit = (socket, event, data) =>
  new Promise((resolve) => socket.emit(event, data, resolve));
test('independent clients create/join, enforce capacity and authenticate rejoin', async (t) => {
  const runtime = createApplication({ repository: new MemoryRepository() });
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
    b = await client();
  const created = await emit(a, 'room:create', { name: 'Alice' });
  assert.equal(created.ok, true);
  assert.equal(created.room.players[0].tokenHash, undefined);
  const joined = await emit(b, 'room:join', { code: created.room.code, name: 'Bob' });
  assert.equal(joined.room.players.length, 2);
  assert.equal((await emit(b, 'room:create', { name: 'Duplicate' })).ok, false);
  const c = await client(),
    d = await client(),
    e = await client();
  await emit(c, 'room:join', { code: created.room.code, name: 'Cara' });
  await emit(d, 'room:join', { code: created.room.code, name: 'Dan' });
  assert.equal((await emit(e, 'room:join', { code: created.room.code, name: 'Extra' })).ok, false);
  assert.equal(
    (await emit(e, 'room:resume', { ...created.session, token: '0'.repeat(64) })).ok,
    false,
  );
  a.disconnect();
  const resumed = await emit(e, 'room:resume', created.session);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.session.playerId, created.session.playerId);
  assert.equal((await emit(e, 'room:resume', created.session)).ok, true);
  const canonical = await runtime.service.resume({
    ...created.session,
    code: created.session.code.toLowerCase(),
    ignoredField: 'not a credential field',
  });
  assert.equal(canonical.session.code, created.session.code);
  assert.equal(canonical.session.ignoredField, undefined);
  const f = await client();
  const duplicateEntries = await Promise.all([
    emit(f, 'room:create', { name: 'Fast guest' }),
    emit(f, 'room:create', { name: 'Fast guest' }),
  ]);
  assert.equal(duplicateEntries.filter((result) => result.ok).length, 1);
});
