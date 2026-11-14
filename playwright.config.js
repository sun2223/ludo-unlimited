import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 150000,
  fullyParallel: false,
  workers: 1,
  use: {
    actionTimeout: 10000,
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node backend/src/index.js',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      env: {
        ALLOW_MEMORY_STORE: 'true',
        PORT: '4173',
        APP_ORIGIN: 'http://localhost:4173',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'node tests/browser/fixtures/server.js',
      url: 'http://localhost:4273',
      reuseExistingServer: false,
    },
  ],
});
