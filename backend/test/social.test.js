import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app.js';
import { MemoryRepository } from '../src/storage/repository.js';
import { RoomService } from '../src/rooms/service.js';
import { SocialService } from '../src/banter/SocialService.js';
const emit = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
test('soundboard is room-scoped, authenticated, idempotent and cannot consume game request limits', async (t) => {
  const runtime = createApplication({
    repository: new MemoryRepository(),
    gameOptions: { die: () => 6 },
  });
  await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await runtime.close();
  });
  const client = async () => {
    const s = io('http://127.0.0.1:' + runtime.server.address().port, { forceNew: true });
    clients.push(s);
    await new Promise((resolve) => s.once('connect', resolve));
    return s;
  };
  const a = await client(),
    b = await client(),
    outsider = await client();
  assert.equal(
    (
      await emit(outsider, 'social:react', {
        kind: 'sound',
        key: 'dhoka',
        requestId: 'request-no-seat-01',
        matchNumber: 0,
      })
    ).ok,
    false,
  );
  const created = await emit(a, 'room:create', { name: 'Alice' });
  await emit(b, 'room:join', { code: created.room.code, name: 'Bob' });
  await emit(outsider, 'room:create', { name: 'Other table' });
  const receivedA = [],
    receivedB = [],
    foreign = [];
  a.on('social:event', (e) => receivedA.push(e));
  b.on('social:event', (e) => receivedB.push(e));
  outsider.on('social:event', (e) => foreign.push(e));
  const input = {
    kind: 'sound',
    key: 'dhoka',
    requestId: 'request-sound-0001',
    matchNumber: 0,
    text: 'untrusted text',
  };
  const delivered = new Promise((resolve) => b.once('social:event', resolve));
  const reaction = await emit(a, 'social:react', input);
  await delivered;
  assert.equal(reaction.ok, true);
  assert.equal(reaction.event.text, 'Dhoka Dhoka');
  assert.deepEqual(receivedA, receivedB);
  assert.equal(receivedB.length, 1);
  assert.equal((await emit(a, 'social:react', input)).duplicate, true);
  assert.equal(receivedB.length, 1);
  const limited = await emit(a, 'social:react', { ...input, requestId: 'request-sound-0002' });
  assert.equal(limited.ok, false);
  assert.ok(limited.retryAfterMs > 0);
  for (let i = 0; i < 16; i++)
    await emit(a, 'social:react', {
      ...input,
      key: 'not-approved',
      requestId: 'invalid-request-' + i,
    });
  assert.equal((await emit(a, 'game:start', {})).ok, true);
  assert.equal((await emit(a, 'game:roll', { version: 0, matchNumber: 1 })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(foreign.length, 0);
  assert.equal(
    runtime.service.publicRoom(await runtime.service.get(created.room.code)).social.manual,
    undefined,
  );
});
test('reaction cooldown and burst budgets survive socket reconnects and are independent of rules', async () => {
  let now = 100000;
  const rooms = new RoomService(new MemoryRepository(), { now: () => now }),
    social = new SocialService(rooms);
  const a = await rooms.create('Alice');
  rooms.connect(a.session, 'first');
  const request = (index) => ({
    kind: 'sound',
    key: 'wah',
    requestId: 'manual-request-' + index,
    matchNumber: 0,
  });
  await social.react(a.session, request(0));
  rooms.disconnect('first');
  rooms.connect(a.session, 'second');
  await assert.rejects(
    () => social.react(a.session, request(1)),
    (error) => error.retryAfterMs > 0,
  );
  for (let i = 1; i < 4; i++) {
    now += 2501;
    await social.react(a.session, request(i));
  }
  now += 2501;
  await assert.rejects(
    () => social.react(a.session, request(4)),
    (error) => error.retryAfterMs > 0,
  );
  now += 15000;
  assert.ok((await social.react(a.session, request(5))).event.id);
});
