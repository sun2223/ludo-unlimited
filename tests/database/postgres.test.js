import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { PostgresRepository } from '../../backend/src/storage/repository.js';
import { createApplication } from '../../backend/src/app.js';
const emit = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
test(
  'real PostgreSQL pg Pool persists gameplay/chat across server restart and enforces a single writer',
  { timeout: 30000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL;
    assert.ok(url, 'Use npm run test:db to launch an isolated PostgreSQL database.');
    let runtime,
      clients = [];
    t.after(async () => {
      clients.forEach((c) => c.disconnect());
      if (runtime) await runtime.close();
    });
    async function boot() {
      const repository = new PostgresRepository(url);
      await repository.ready();
      const app = createApplication({ repository, gameOptions: { die: () => 6 } });
      await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
      return app;
    }
    async function connect() {
      const s = io('http://127.0.0.1:' + runtime.server.address().port, { forceNew: true });
      clients.push(s);
      await new Promise((resolve) => s.on('connect', resolve));
      return s;
    }
    runtime = await boot();
    const contender = new PostgresRepository(url);
    await assert.rejects(() => contender.ready(), /Another Ludo server/);
    await contender.close();
    const a = await connect(),
      b = await connect();
    const alice = await emit(a, 'room:create', { name: 'Persistent Alice' });
    const bob = await emit(b, 'room:join', { code: alice.room.code, name: 'Persistent Bob' });
    await emit(a, 'game:start', {});
    await emit(a, 'game:roll', { version: 0, matchNumber: 1 });
    await emit(a, 'game:move', { version: 1, matchNumber: 1, tokenIndex: 0 });
    await emit(b, 'chat:send', { text: 'This message survives restart.' });
    clients.forEach((c) => c.disconnect());
    await runtime.close();
    runtime = null;
    runtime = await boot();
    const rejoined = await connect();
    const restored = await emit(rejoined, 'room:resume', alice.session);
    assert.equal(restored.ok, true);
    assert.equal(restored.room.game.players[0].tokens[0], 0);
    assert.equal(restored.room.game.version, 2);
    assert.equal(restored.room.chat[0].text, 'This message survives restart.');
    assert.equal(restored.room.players[0].tokenHash, undefined);
    const another = await connect();
    assert.equal((await emit(another, 'room:resume', bob.session)).ok, true);
    const repository = runtime.service.repository;
    const leaseLost = new Promise((resolve) => repository.lease.once('error', resolve));
    await repository.pool.query('SELECT pg_terminate_backend($1)', [repository.lease.processID]);
    await leaseLost;
    assert.equal(repository.healthy, false);
    assert.equal(
      (await fetch('http://127.0.0.1:' + runtime.server.address().port + '/api/health')).status,
      503,
    );
    assert.equal((await emit(rejoined, 'game:roll', { version: 2, matchNumber: 1 })).ok, false);
  },
);
