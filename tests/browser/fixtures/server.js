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
});
runtime.app.use('/__test', (req, res, next) =>
  req.get('x-ludo-fixture') === 'local-animation-test' ? next() : res.sendStatus(403),
);
runtime.app.post('/__test/seed', express.json(), async (req, res) => {
  const { code, from = 2, roll = 3, tokens, enemy } = req.body;
  const room = await repository.get(code);
  if (!room || room.players.length < 2) return res.sendStatus(404);
  const version = (room.game?.version ?? 0) + 20;
  room.game = newGame(room.players);
  room.game.version = version;
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
runtime.server.listen(4273, '127.0.0.1', () =>
  console.log('Local animation fixture http://localhost:4273'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await runtime.close();
    process.exit(0);
  });
