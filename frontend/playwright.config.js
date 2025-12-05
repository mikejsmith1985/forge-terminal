import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8333',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'cd .. && NO_BROWSER=1 go run ./cmd/forge',
    url: 'http://localhost:8333',
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
