import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright', // Note: adjusted path
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'echo "Using existing dev server"',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
