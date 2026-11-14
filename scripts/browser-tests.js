import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args =
  process.argv[2] === 'install' ? ['install', 'chromium'] : ['test', ...process.argv.slice(2)];
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), ...args],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(new URL('../.cache/browsers', import.meta.url)),
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
