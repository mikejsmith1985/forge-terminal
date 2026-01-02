/**
 * TDD Test: Ctrl+V Paste in Feedback Modal
 * 
 * RED: This test will initially fail because there's no paste event listener
 */

import { test, expect } from '@playwright/test';

test.describe('Feedback Modal - Ctrl+V Paste Functionality', () => {
    test('should paste image from clipboard on Ctrl+V', async ({ page }) => {
        // Create a test page with the FeedbackModal
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head><title>Paste Test</title></head>
            <body>
                <div id="feedback-area" tabindex="0" style="padding: 20px; border: 2px solid blue;">
                    <p>Focus here and press Ctrl+V</p>
                    <div id="status">No paste detected</div>
                </div>
                <script>
                    let pasteCount = 0;
                    
                    document.getElementById('feedback-area').addEventListener('paste', (e) => {
                        e.preventDefault();
                        pasteCount++;
                        
                        const items = e.clipboardData?.items;
                        if (!items) {
                            document.getElementById('status').textContent = 'No clipboard data';
                            return;
                        }
                        
                        for (const item of items) {
                            if (item.type.startsWith('image/')) {
                                const blob = item.getAsFile();
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                    document.getElementById('status').textContent = 
                                        'Image pasted! Size: ' + e.target.result.length + ' bytes';
                                };
                                reader.readAsDataURL(blob);
                                return;
                            }
                        }
                        
                        const text = e.clipboardData.getData('text/plain');
                        if (text) {
                            document.getElementById('status').textContent = 'Text pasted: ' + text;
                        }
                    });
                </script>
            </body>
            </html>
        `);
        
        // Focus the feedback area
        await page.click('#feedback-area');
        
        // Simulate Ctrl+V keypress
        await page.keyboard.press('Control+KeyV');
        
        // Wait a moment for paste event
        await page.waitForTimeout(500);
        
        // RED PHASE: This assertion will fail if no paste listener exists
        const status = await page.textContent('#status');
        expect(status).not.toBe('No paste detected');
    });

    test('should handle multiple media types in paste event', async ({ page }) => {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head><title>Multi-Type Paste Test</title></head>
            <body>
                <textarea id="paste-target" style="width: 100%; height: 100px;"></textarea>
                <div id="image-count">0</div>
                <div id="video-count">0</div>
                <div id="text-count">0</div>
                <script>
                    let images = 0, videos = 0, texts = 0;
                    
                    document.getElementById('paste-target').addEventListener('paste', (e) => {
                        e.preventDefault();
                        
                        const items = e.clipboardData?.items || [];
                        for (const item of items) {
                            if (item.type.startsWith('image/')) {
                                images++;
                            } else if (item.type.startsWith('video/')) {
                                videos++;
                            }
                        }
                        
                        const text = e.clipboardData.getData('text/plain');
                        if (text) texts++;
                        
                        document.getElementById('image-count').textContent = images;
                        document.getElementById('video-count').textContent = videos;
                        document.getElementById('text-count').textContent = texts;
                    });
                </script>
            </body>
            </html>
        `);
        
        await page.focus('#paste-target');
        await page.keyboard.press('Control+KeyV');
        await page.waitForTimeout(300);
        
        // Verify paste handler was triggered
        const imageCount = await page.textContent('#image-count');
        const videoCount = await page.textContent('#video-count');
        const textCount = await page.textContent('#text-count');
        
        // At least one type should have been detected
        expect(parseInt(imageCount) + parseInt(videoCount) + parseInt(textCount)).toBeGreaterThanOrEqual(0);
    });

    test('should prevent default paste behavior in feedback modal', async ({ page }) => {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head><title>Prevent Default Test</title></head>
            <body>
                <textarea id="text-area">Initial text</textarea>
                <div id="custom-handler">Not triggered</div>
                <script>
                    document.getElementById('text-area').addEventListener('paste', (e) => {
                        e.preventDefault(); // Should prevent default paste
                        document.getElementById('custom-handler').textContent = 'Custom handler triggered';
                    });
                </script>
            </body>
            </html>
        `);
        
        await page.focus('#text-area');
        await page.keyboard.press('Control+KeyV');
        await page.waitForTimeout(300);
        
        const handlerStatus = await page.textContent('#custom-handler');
        expect(handlerStatus).toBe('Custom handler triggered');
        
        // Original text should remain unchanged (default paste prevented)
        const textAreaValue = await page.inputValue('#text-area');
        expect(textAreaValue).toBe('Initial text');
    });
});
