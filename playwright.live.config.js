import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/live',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: process.env.LUDO_LIVE_URL ?? 'https://ludo-unlimited.onrender.com',
    headless: true,
    actionTimeout: 15000,
    trace: 'retain-on-failure',
  },
});
