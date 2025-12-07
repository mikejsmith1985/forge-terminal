// devmode-tests.spec.js - Playwright tests for DevMode feature

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8080';

test.describe('DevMode Feature Tests', () => {
  test('should hide Files tab by default', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const filesTab = await page.locator('text=Files').count();
    expect(filesTab).toBe(0);
  });

  test('should show Cards tab always', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    const cardsTab = await page.locator('text=Cards').count();
    expect(cardsTab).toBeGreaterThan(0);
  });

  test('Settings modal should have DevMode toggle', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });

    const devModeLabel = await page.locator('text=Dev Mode').count();
    expect(devModeLabel).toBeGreaterThan(0);
  });

  test('DevMode checkbox should be present', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });

    const checkbox = page.locator('input[name="devMode"]');
    expect(await checkbox.isVisible()).toBe(true);
  });

  test('toggling DevMode ON should show Files tab', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    let filesCount = await page.locator('text=Files').count();
    expect(filesCount).toBe(0);

    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });

    const checkbox = page.locator('input[name="devMode"]');
    await checkbox.check();
    await page.waitForTimeout(500);

    await page.press('Escape');
    await page.waitForTimeout(500);

    filesCount = await page.locator('text=Files').count();
    expect(filesCount).toBeGreaterThan(0);
  });

  test('checkbox should reflect current state', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });

    const checkbox = page.locator('input[name="devMode"]');
    let isChecked = await checkbox.isChecked();
    expect(isChecked).toBe(false);

    await checkbox.check();
    await page.waitForTimeout(300);

    isChecked = await checkbox.isChecked();
    expect(isChecked).toBe(true);

    await checkbox.uncheck();
    await page.waitForTimeout(300);

    isChecked = await checkbox.isChecked();
    expect(isChecked).toBe(false);
  });

  test('toggling DevMode OFF should hide Files tab', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });

    const checkbox = page.locator('input[name="devMode"]');
    await checkbox.check();
    await page.waitForTimeout(500);

    let filesCount = await page.locator('text=Files').count();
    expect(filesCount).toBeGreaterThan(0);

    await checkbox.uncheck();
    await page.waitForTimeout(500);

    filesCount = await page.locator('text=Files').count();
    expect(filesCount).toBe(0);
  });

  test('only File Explorer affected by DevMode', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    let cardsCount = await page.locator('text=Cards').count();
    expect(cardsCount).toBeGreaterThan(0);

    await page.click('button[title="Shell Settings"]');
    await page.waitForSelector('.modal-header', { timeout: 5000 });

    await page.locator('input[name="devMode"]').check();
    await page.waitForTimeout(500);

    await page.press('Escape');
    await page.waitForTimeout(500);

    cardsCount = await page.locator('text=Cards').count();
    expect(cardsCount).toBeGreaterThan(0);
  });
});
