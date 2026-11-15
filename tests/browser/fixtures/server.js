// Local integration fixture only. This file is never imported by the application.
import express from 'express';
import { createApplication } from '../../../backend/src/app.js';
import { MemoryRepository } from '../../../backend/src/storage/repository.js';
import { newGame } from '@ludo/shared';
const repository = new MemoryRepository();
let dice = [];
const runtime = createApplication({
  repository,
  origin: 'http://localhost:4273',
  gameOptions: { die: () => dice.shift() ?? 1 },
  socialOptions: {
    config: {
      REACTION_COOLDOWN_MS: 120,
      ROOM_REACTION_MS: 0,
      BURST_LIMIT: 100,
      AUTO_COOLDOWN_MS: 0,
      CATEGORY_COOLDOWN_MS: 0,
    },
  },
});
runtime.app.use('/__test', (req, res, next) =>
  req.get('x-ludo-fixture') === 'local-animation-test' ? next() : res.sendStatus(403),
);
runtime.app.post('/__test/seed', express.json(), async (req, res) => {
  const { code, from = 2, roll = 3, tokens, enemy, turn = 0 } = req.body;
  const room = await repository.get(code);
  if (!room || room.players.length < 2) return res.sendStatus(404);
  const version = (room.game?.version ?? 0) + 20;
  room.game = newGame(room.players);
  room.game.version = version;
  room.game.turn = turn;
  room.game.players[0].tokens = tokens ?? [from, -1, -1, -1];
  if (enemy) room.game.players[1].tokens = enemy;
  room.matchNumber ||= 1;
  room.revision++;
  room.lastEvent = null;
  dice = [roll];
  await repository.save(room);
  runtime.io.to(code).emit('room:state', runtime.service.publicRoom(room));
  res.json({ version });
});
runtime.app.get('/__test/state/:code', async (req, res) =>
  res.json(runtime.service.publicRoom(await repository.get(req.params.code))),
);
runtime.app.post('/__test/social-replay', express.json(), async (req, res) => {
  const room = await repository.get(req.body.code);
  const event = Object.values(room.social?.manual ?? {})
    .flatMap((rate) => rate.receipts)
    .find((receipt) => receipt.event.id === req.body.id)?.event;
  if (!event) return res.sendStatus(404);
  runtime.io
    .to(room.code)
    .emit(
      'social:event',
      req.body.expired
        ? { ...event, id: event.id + '-expired', expiresAt: Date.now() - 1, sentAt: Date.now() }
        : { ...event, sentAt: Date.now() },
    );
  res.json({ ok: true });
});
runtime.app.post('/__test/slow', express.json(), async (req, res) => {
  const room = await repository.get(req.body.code);
  runtime.monitor.observe(room);
  runtime.monitor.watches.get(room.code).since =
    Date.now() - runtime.service.banter.config.SLOW_TURN_MS - 1;
  await runtime.monitor.scan();
  res.json({ ok: true });
});
runtime.server.listen(4273, '127.0.0.1', () =>
  console.log('Local animation fixture http://localhost:4273'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await runtime.close();
    process.exit(0);
  });
