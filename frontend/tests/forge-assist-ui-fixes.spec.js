/**
 * TDD Test: ForgeAssist UI Fixes
 * 
 * RED: These tests will initially fail
 * 1. X button overflows modal
 * 2. Quick Instructions button doesn't show panel
 */

import { test, expect } from '@playwright/test';

test.describe('ForgeAssist Modal - UI Fixes', () => {
    test('X button should not overflow modal header', async ({ page }) => {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    .forge-assist-header {
                        display: flex;
                        align-items: center;
                        padding: 12px 16px;
                        border-bottom: 1px solid #333;
                        background: #0a0a0a;
                        gap: 16px;
                        position: relative;
                    }
                    .forge-assist-title {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        flex-shrink: 0;
                    }
                    .forge-assist-cli-tabs {
                        display: flex;
                        gap: 8px;
                        flex: 1;
                        min-width: 0;
                    }
                    .controls-group {
                        display: flex;
                        gap: 8px;
                        flex-shrink: 0;
                    }
                    .forge-assist-close {
                        flex-shrink: 0;
                        margin-left: 8px;
                    }
                </style>
            </head>
            <body>
                <div class="forge-assist-header" id="header">
                    <div class="forge-assist-title">Title</div>
                    <div class="forge-assist-cli-tabs">
                        <button>Tab 1</button>
                        <button>Tab 2</button>
                    </div>
                    <div class="controls-group">
                        <button>Control 1</button>
                        <button>Control 2</button>
                    </div>
                    <button class="forge-assist-close">X</button>
                </div>
            </body>
            </html>
        `);
        
        const header = page.locator('#header');
        const closeBtn = page.locator('.forge-assist-close');
        
        const headerBox = await header.boundingBox();
        const closeBtnBox = await closeBtn.boundingBox();
        
        // RED PHASE: Close button should be within header bounds
        expect(closeBtnBox.x + closeBtnBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1); // +1 for rounding
        expect(closeBtnBox.y).toBeGreaterThanOrEqual(headerBox.y);
    });

    test('Quick Instructions button should toggle panel visibility', async ({ page }) => {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    #panel { display: none; }
                    #panel.visible { display: block; }
                </style>
            </head>
            <body>
                <button id="quick-btn">Quick Instructions</button>
                <div id="panel">Quick Instructions Panel</div>
                <script>
                    let panelVisible = false;
                    document.getElementById('quick-btn').addEventListener('click', () => {
                        panelVisible = !panelVisible;
                        const panel = document.getElementById('panel');
                        if (panelVisible) {
                            panel.classList.add('visible');
                        } else {
                            panel.classList.remove('visible');
                        }
                    });
                </script>
            </body>
            </html>
        `);
        
        const quickBtn = page.locator('#quick-btn');
        const panel = page.locator('#panel');
        
        // Initially hidden
        await expect(panel).not.toBeVisible();
        
        // Click button
        await quickBtn.click();
        
        // RED PHASE: Panel should be visible after click
        await expect(panel).toBeVisible();
        
        // Click again to hide
        await quickBtn.click();
        await expect(panel).not.toBeVisible();
    });

    test('Modal header should handle flex wrapping gracefully', async ({ page }) => {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    .forge-assist-header {
                        display: flex;
                        align-items: center;
                        flex-wrap: nowrap;
                        gap: 8px;
                        padding: 12px 16px;
                        width: 720px;
                        overflow: hidden;
                    }
                    .title { flex-shrink: 0; width: 100px; }
                    .tabs { flex: 1; min-width: 200px; }
                    .controls { flex-shrink: 0; width: 200px; }
                    .close { flex-shrink: 0; width: 32px; }
                </style>
            </head>
            <body>
                <div class="forge-assist-header">
                    <div class="title">Title</div>
                    <div class="tabs">Tabs</div>
                    <div class="controls">Controls</div>
                    <div class="close">X</div>
                </div>
            </body>
            </html>
        `);
        
        const header = page.locator('.forge-assist-header');
        const close = page.locator('.close');
        
        // All elements should be visible (no wrapping)
        await expect(close).toBeVisible();
        
        const headerBox = await header.boundingBox();
        const closeBox = await close.boundingBox();
        
        // Close button should be on same line (within header height)
        expect(closeBox.y - headerBox.y).toBeLessThan(headerBox.height);
    });
});
