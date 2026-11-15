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
    const captureSeed = await runtime.service.repository.get(alice.room.code);
    captureSeed.game.players[0].tokens[0] = 8;
    captureSeed.game.players[1].tokens[0] = 1;
    await runtime.service.repository.save(captureSeed);
    await emit(a, 'game:roll', { version: 2, matchNumber: 1 });
    await emit(a, 'game:move', { version: 3, matchNumber: 1, tokenIndex: 0 });
    const sentReaction = await emit(a, 'social:react', {
      kind: 'sound',
      key: 'wah',
      requestId: 'persist-reaction-001',
      matchNumber: 1,
    });
    assert.equal(sentReaction.ok, true);
    clients.forEach((c) => c.disconnect());
    await runtime.close();
    runtime = null;
    runtime = await boot();
    const rejoined = await connect();
    const restored = await emit(rejoined, 'room:resume', alice.session);
    assert.equal(restored.ok, true);
    assert.equal(restored.room.game.players[0].tokens[0], 14);
    assert.equal(restored.room.social.captures[alice.session.playerId][bob.session.playerId], 1);
    assert.equal(restored.room.game.version, 4);
    const limited = await emit(rejoined, 'social:react', {
      kind: 'sound',
      key: 'dhoka',
      requestId: 'persist-reaction-002',
      matchNumber: 1,
    });
    assert.equal(limited.ok, false);
    assert.ok(limited.retryAfterMs > 0);
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
    assert.equal((await emit(rejoined, 'game:roll', { version: 4, matchNumber: 1 })).ok, false);
  },
);

test(
  'Render standby serves readiness but gates sockets and writes until the old writer releases',
  { timeout: 15000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL;
    const owner = new PostgresRepository(url);
    await owner.ready();
    let oldApp = createApplication({ repository: owner }),
      newApp;
    const clients = [];
    t.after(async () => {
      clients.forEach((s) => s.disconnect());
      if (oldApp) await oldApp.close();
      if (newApp) await newApp.close();
    });
    await new Promise((resolve) => oldApp.server.listen(0, '127.0.0.1', resolve));
    const oldClient = io('http://127.0.0.1:' + oldApp.server.address().port, { forceNew: true });
    clients.push(oldClient);
    await new Promise((resolve) => oldClient.once('connect', resolve));
    const created = await emit(oldClient, 'room:create', { name: 'Handoff Alice' });
    assert.equal(created.ok, true);
    const replacement = new PostgresRepository(url);
    await replacement.ready({ allowStandby: true, handoffTimeoutMs: 8000, retryMs: 20 });
    assert.equal(replacement.standby, true);
    assert.equal(replacement.healthy, false);
    await assert.rejects(() => replacement.get(created.room.code), /unavailable/);
    newApp = createApplication({ repository: replacement });
    await new Promise((resolve) => newApp.server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + newApp.server.address().port;
    const health = await fetch(origin + '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, starting: true });
    const nextClient = io(origin, { forceNew: true });
    clients.push(nextClient);
    const connected = new Promise((resolve) => nextClient.once('connect', resolve));
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(nextClient.connected, false);
    assert.equal(owner.healthy, true);
    await oldApp.close();
    oldApp = null;
    await replacement.whenActive();
    await connected;
    assert.equal(replacement.healthy, true);
    assert.equal(replacement.standby, false);
    const restored = await emit(nextClient, 'room:resume', created.session);
    assert.equal(restored.ok, true);
    assert.equal(restored.session.playerId, created.session.playerId);
    const contender = new PostgresRepository(url);
    await assert.rejects(() => contender.ready(), /Another Ludo server/);
    await contender.close();
    assert.deepEqual(await (await fetch(origin + '/api/health')).json(), { ok: true });
  },
);

test(
  'Render handoff timeout fails closed and never steals an active writer lock',
  { timeout: 10000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL,
      owner = new PostgresRepository(url),
      waiting = new PostgresRepository(url);
    try {
      await owner.ready();
      await waiting.ready({ allowStandby: true, handoffTimeoutMs: 80, retryMs: 10 });
      await assert.rejects(waiting.whenActive(), /Timed out/);
      assert.equal(waiting.healthy, false);
      assert.equal(waiting.standby, false);
      assert.equal(owner.healthy, true);
      await assert.rejects(() => waiting.get('ABC234'), /unavailable/);
    } finally {
      await waiting.close();
      await owner.close();
    }
  },
);
