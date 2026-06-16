/**
 * Ctrl+V Native Paste Validation Test (v3.14.9)
 *
 * This test validates the ROBUST paste fix where:
 * 1. Ctrl+V returns true (lets event propagate)
 * 2. Browser triggers native paste event
 * 3. handlePaste listener catches it via e.clipboardData
 *
 * Tests both synthetic paste events AND real Ctrl+V key presses
 * per the Playwright real-browser-events requirement.
 */

const { test, expect, visitWithoutTour, waitForTerminal } = require('../fixtures/forge');

test.describe('Ctrl+V Native Paste - v3.14.9 Fix', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, 'http://localhost:9999');
    await waitForTerminal(page);
    await page.waitForTimeout(2000);
  });

  test.describe('Synthetic Paste Events (tests handlePaste handler)', () => {
    test('should handle text paste via paste event', async ({ page }) => {
      const testText = `native-paste-test-${Date.now()}`;

      // Focus terminal
      await page.locator('.xterm-helper-textarea').first().focus();
      await page.waitForTimeout(500);

      // Dispatch synthetic paste event to test the handler
      await page.evaluate((text) => {
        const textarea = window.document.querySelector('.xterm-helper-textarea');
        if (!textarea) throw new Error('Terminal textarea not found');

        const dt = new window.DataTransfer();
        dt.setData('text/plain', text);

        const pasteEvent = new window.ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });

        // Dispatch to textarea (where native paste events fire)
        textarea.dispatchEvent(pasteEvent);
      }, testText);
      console.log('Synthetic paste event dispatched');

      await page.waitForTimeout(1500);

      // Verify text appears in terminal buffer
      const bufferText = await page.evaluate(() => {
        const buffer = window.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        return fullText;
      });
      console.log('Text found in buffer:', bufferText.includes(testText));
      expect(bufferText).toContain(testText);

      await page.screenshot({ path: 'screenshots/v3.14.9-text-paste-synthetic.png' });
    });

    test('should handle image paste via paste event', async ({ page }) => {
      await page.locator('.xterm-helper-textarea').first().focus();
      await page.waitForTimeout(500);

      // Create a test image via canvas and dispatch a synthetic paste event
      await page.evaluate(() => {
        const textarea = window.document.querySelector('.xterm-helper-textarea');
        if (!textarea) throw new Error('Terminal textarea not found');

        // Create test image
        const canvas = window.document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText('v3.14.9 TEST', 45, 100);

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            const dt = new window.DataTransfer();
            const file = new window.File([blob], 'test-v3149.png', { type: 'image/png' });
            dt.items.add(file);

            const pasteEvent = new window.ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            });

            textarea.dispatchEvent(pasteEvent);
            resolve();
          }, 'image/png');
        });
      });
      console.log('Image paste event dispatched');

      await page.waitForTimeout(4000);

      // Verify "see file at" appears in terminal buffer
      const bufferText = await page.evaluate(() => {
        const buffer = window.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        return fullText;
      });
      console.log('Image path found:', bufferText.includes('see file at'));
      expect(bufferText).toContain('see file at');

      await page.screenshot({ path: 'screenshots/v3.14.9-image-paste-synthetic.png' });
    });
  });

  test.describe('Real Ctrl+V Key Press (tests full flow)', () => {
    test('should paste text via real Ctrl+V key press', async ({ page }) => {
      const testText = `realkey-paste-${Date.now()}`;

      // First, copy text to clipboard using navigator API
      await page.evaluate(async (text) => {
        await window.navigator.clipboard.writeText(text);
      }, testText);
      console.log('Text written to clipboard');

      // Focus terminal
      await page.locator('.xterm-helper-textarea').first().focus();
      await page.waitForTimeout(500);

      // Press real Ctrl+V
      await page.keyboard.press('Control+V');
      console.log('Real Ctrl+V pressed');

      await page.waitForTimeout(1500);

      // Verify text appears in terminal
      const bufferText = await page.evaluate(() => {
        const buffer = window.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        return fullText;
      });
      console.log('Real Ctrl+V result - text found:', bufferText.includes(testText));
      expect(bufferText).toContain(testText);

      await page.screenshot({ path: 'screenshots/v3.14.9-text-paste-real-ctrlv.png' });
    });

    test('should paste image via real Ctrl+V key press', async ({ page }) => {
      // Write image to clipboard
      await page.evaluate(async () => {
        const canvas = window.document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText('REAL Ctrl+V', 50, 100);
        ctx.fillText(Date.now().toString(), 40, 130);

        return new Promise((resolve) => {
          canvas.toBlob(async (blob) => {
            const item = new window.ClipboardItem({ 'image/png': blob });
            await window.navigator.clipboard.write([item]);
            resolve();
          }, 'image/png');
        });
      });
      console.log('Image written to clipboard');

      // Focus terminal
      await page.locator('.xterm-helper-textarea').first().focus();
      await page.waitForTimeout(500);

      // Press real Ctrl+V
      await page.keyboard.press('Control+V');
      console.log('Real Ctrl+V pressed for image');

      await page.waitForTimeout(4000);

      // Verify "see file at" appears in terminal buffer
      const bufferText = await page.evaluate(() => {
        const buffer = window.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        return fullText;
      });
      console.log('Real Ctrl+V image result:', bufferText.includes('see file at'));
      expect(bufferText).toContain('see file at');

      await page.screenshot({ path: 'screenshots/v3.14.9-image-paste-real-ctrlv.png' });
    });
  });

  test.describe('Reliability - 10 Consecutive Pastes', () => {
    test('should handle 10 consecutive text pastes without failure', async ({ page }) => {
      const results = [];

      for (let i = 0; i < 10; i++) {
        const iteration = i + 1;
        const testText = `iter-${iteration}-${Date.now()}`;

        // Write to clipboard
        await page.evaluate(async (text) => {
          await window.navigator.clipboard.writeText(text);
        }, testText);

        // Focus and paste
        await page.locator('.xterm-helper-textarea').first().focus();
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(1000);

        // Verify
        const bufferText = await page.evaluate(() => {
          const buffer = window.term.buffer.active;
          let fullText = '';
          for (let j = 0; j < buffer.length; j++) {
            const line = buffer.getLine(j);
            if (line) {
              fullText += line.translateToString(true) + '\n';
            }
          }
          return fullText;
        });
        const success = bufferText.includes(`iter-${iteration}`);
        results.push({ iteration, success });
        console.log(`Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`);

        // Press Enter to execute and clear
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }

      // Final verification - require 100% success for robustness
      const passCount = results.filter((r) => r.success).length;
      console.log(`Final results: ${passCount}/10 passed`);
      expect(passCount).toBe(10);

      await page.screenshot({ path: 'screenshots/v3.14.9-10x-reliability.png' });
    });
  });
});
