import { test, expect } from '@playwright/test';

test('scaffold failing test', async ({ page }) => {
  // Intentionally failing assertion for TDD scaffold
  expect(true).toBe(false);
});
