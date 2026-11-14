import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { RoomService } from './rooms/service.js';
import { registerRooms } from './network/rooms.js';
import { registerGame } from './network/game.js';
import { registerChat } from './network/chat.js';
import { ChatService } from './chat/service.js';
export function createApplication({
  repository,
  origin = 'http://localhost:5173,http://localhost:3001',
  gameOptions,
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
  const service = new RoomService(repository, gameOptions);
  const chat = new ChatService(service);
  io.on('connection', (socket) => {
    let windowStart = Date.now(),
      calls = 0;
    const handle = (event, fn) =>
      socket.on(event, async (data, ack) => {
        if (typeof ack !== 'function') return;
        if (Date.now() - windowStart > 10000) {
          windowStart = Date.now();
          calls = 0;
        }
        if (++calls > 40) return ack({ ok: false, error: 'Slow down a little and try again.' });
        try {
          ack({ ok: true, ...(await fn(data)) });
        } catch (error) {
          const expected = !error.code;
          if (!expected) console.error('Room operation failed:', error.message);
          ack({
            ok: false,
            error: expected ? error.message : 'The server could not save that action. Try again.',
          });
        }
      });
    registerRooms(io, socket, service, handle);
    registerGame(io, socket, service, handle);
    registerChat(io, socket, service, chat, handle);
  });
  return {
    app,
    server,
    io,
    service,
    close: async () => {
      await new Promise((resolve) => io.close(resolve));
      await repository.close();
    },
  };
}
