import { createApplication } from './app.js';
import { MemoryRepository, PostgresRepository } from './storage/repository.js';
const memory = process.env.ALLOW_MEMORY_STORE === 'true' && process.env.NODE_ENV !== 'production';
if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN)
  throw new Error('Set APP_ORIGIN to your public HTTPS origin in production.');
if (!memory && !process.env.DATABASE_URL)
  throw new Error(
    'DATABASE_URL is required. For temporary development only set ALLOW_MEMORY_STORE=true.',
  );
const repository = memory
  ? new MemoryRepository()
  : new PostgresRepository(process.env.DATABASE_URL);
if (!memory) await repository.ready({ allowStandby: process.env.RENDER === 'true' });
else console.warn('DEVELOPMENT MEMORY STORE: rooms disappear when the server stops.');
const runtime = createApplication({ repository, origin: process.env.APP_ORIGIN });
if (repository.standby)
  console.log(
    'Render handoff: waiting for the previous instance to release the database writer lease.',
  );
runtime.server.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '0.0.0.0', () =>
  console.log('Ludo Unlimited API http://localhost:' + (process.env.PORT ?? 3001)),
);
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await runtime.close();
  process.exit(code);
}
repository.whenActive?.().catch((error) => {
  console.error('Render database handoff failed:', error.message);
  void stop(1);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void stop(0));
