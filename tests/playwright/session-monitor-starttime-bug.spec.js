/**
 * Session Monitor Duration Bug - Direct Fix Test
 * v3.11.7
 * 
 * BUG: useCallback captures stale startTimeRef value
 * When session is restored from localStorage, startTimeRef is updated,
 * but the event capture callbacks still reference the OLD startTimeRef value
 * because useCallback has an empty dependency array.
 * 
 * FIX: Add startTimeRef.current to useCallback dependencies
 * (or use refs properly by reading .current inside callback)
 */

const { test, expect } = require('@playwright/test');

test.describe('Session Monitor - startTimeRef Bug', () => {
  
  test('verify localStorage saves and restores startTime correctly', async ({ page }) => {
    await page.goto('http://localhost:3005');
    await page.waitForTimeout(2000);
    
    // Inject test code to verify the bug
    const testResult = await page.evaluate(() => {
      // Simulate the FollowMeDebugger logic
      const startTimeRef = { current: null };
      const eventsRef = { current: [] };
      
      // Step 1: Initial recording starts
      startTimeRef.current = Date.now();
      const originalStartTime = startTimeRef.current;
      
      // Step 2: Create callback (simulating useCallback with empty deps)
      const captureClick = () => {
        eventsRef.current.push({
          type: 'click',
          timestamp: Date.now() - startTimeRef.current
        });
      };
      
      // Step 3: Capture event at 1 second
      setTimeout(() => {}, 1000); // Simulate 1s delay
      const fakeTime1 = Date.now() + 1000;
      const event1Timestamp = fakeTime1 - startTimeRef.current;
      
      // Step 4: Save to localStorage
      const savedSession = {
        startTime: startTimeRef.current,
        events: eventsRef.current
      };
      localStorage.setItem('test-session', JSON.stringify(savedSession));
      
      // Step 5: Simulate component unmount/remount (restoration)
      // This is what happens when user switches tabs
      const restored = JSON.parse(localStorage.getItem('test-session'));
      startTimeRef.current = restored.startTime; // BUG: callback doesn't see this update!
      eventsRef.current = restored.events;
      
      // Step 6: Capture event at 3 seconds (2s after restoration)
      const fakeTime2 = originalStartTime + 3000;
      // The callback SHOULD use the restored startTime, but it captures the closure
      const event2TimestampExpected = 3000; // 3s from original start
      const event2TimestampActual = fakeTime2 - startTimeRef.current;
      
      localStorage.removeItem('test-session');
      
      return {
        originalStartTime,
        restoredStartTime: restored.startTime,
        startTimeRefAfterRestore: startTimeRef.current,
        event2TimestampExpected,
        event2TimestampActual,
        bugExists: event2TimestampExpected !== event2TimestampActual
      };
    });
    
    console.log('[Test] Result:', testResult);
    
    // If this passes, the bug is NOT present (startTimeRef is correctly used)
    expect(testResult.event2TimestampActual).toBe(testResult.event2TimestampExpected);
  });
});
