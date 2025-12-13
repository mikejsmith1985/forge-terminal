import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:8333',
    headless: process.env.HEADED !== 'true',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // Expect Forge to already be running - don't try to start it
    // This allows testing against the real Forge server
    command: 'echo "Using existing Forge server at http://127.0.0.1:8333"',
    url: 'http://127.0.0.1:8333',
    reuseExistingServer: true,
    timeout: 120 * 1000, // 2 minutes - enough time for server check
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
