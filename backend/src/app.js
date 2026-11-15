import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { RoomService } from './rooms/service.js';
import { registerRooms } from './network/rooms.js';
import { registerGame } from './network/game.js';
import { registerChat } from './network/chat.js';
import { BanterEngine } from './banter/BanterEngine.js';
import { SlowTurnMonitor } from './banter/SlowTurnMonitor.js';
import { SocialService } from './banter/SocialService.js';
import { registerSocial } from './network/social.js';
import { ChatService } from './chat/service.js';
export function createApplication({
  repository,
  origin = 'http://localhost:5173,http://localhost:3001',
  gameOptions,
  socialOptions,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({ contentSecurityPolicy: { directives: { 'connect-src': ["'self'", 'ws:', 'wss:'] } } }),
  );
  app.get('/api/health', (_req, res) => {
    const ok = repository.healthy !== false;
    res.status(ok ? 200 : 503).json({ ok });
  });
  app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
  const server = createServer(app);
  const origins = origin.split(',').map((o) => o.trim());
  const io = new Server(server, {
    maxHttpBufferSize: 16384,
    cors: { origin: origins },
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || origins.includes(req.headers.origin)),
  });
  const service = new RoomService(repository, {
    ...gameOptions,
    banter: new BanterEngine(socialOptions),
  });
  const monitor = new SlowTurnMonitor(io, service);
  const chat = new ChatService(service);
  const social = new SocialService(service);
  io.on('connection', (socket) => {
    const buckets = new Map();
    const handle = (event, fn) =>
      socket.on(event, async (data, ack) => {
        if (typeof ack !== 'function') return;
        // Decorative traffic cannot consume the dice/chat request allowance.
        const key = event.startsWith('social:') ? 'social' : 'game';
        let bucket = buckets.get(key);
        if (!bucket || Date.now() - bucket.since > 10000) {
          bucket = { since: Date.now(), calls: 0 };
          buckets.set(key, bucket);
        }
        if (++bucket.calls > (key === 'social' ? 12 : 40))
          return ack({
            ok: false,
            error: 'Slow down a little and try again.',
            retryAfterMs: 10000,
          });
        try {
          ack({ ok: true, ...(await fn(data)) });
        } catch (error) {
          const expected = !error.code;
          if (!expected) console.error('Room operation failed:', error.message);
          ack({
            ok: false,
            error: expected ? error.message : 'The server could not save that action. Try again.',
            ...(Number.isFinite(error.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {}),
          });
        }
      });
    registerRooms(io, socket, service, handle);
    registerGame(io, socket, service, handle, monitor);
    registerChat(io, socket, service, chat, handle);
    registerSocial(io, socket, social, handle);
  });
  return {
    app,
    server,
    io,
    service,
    monitor,
    close: async () => {
      monitor.close();
      await new Promise((resolve) => io.close(resolve));
      await repository.close();
    },
  };
}
