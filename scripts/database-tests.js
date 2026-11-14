import EmbeddedPostgres from 'embedded-postgres';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
await mkdir(cache, { recursive: true });
const directory = await mkdtemp(cache + 'pg-test-');
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  port,
  user: 'ludo_test',
  password: 'local_test_only',
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
let started = false;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  const client = postgres.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  try {
    await client.query(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  } finally {
    await client.end();
  }
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', 'tests/database/postgres.test.js'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgresql://ludo_test:local_test_only@127.0.0.1:${port}/postgres`,
      },
    });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  process.exitCode = exitCode ?? 1;
} finally {
  if (started) await postgres.stop();
}
// Keep the isolated test directory under ignored .cache for inspection; never touch a user database.
