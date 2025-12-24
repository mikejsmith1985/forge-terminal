# CRITICAL FINDING: Auto-Respond Buffer Issue

## Root Cause Identified

After extensive testing with Playwright automation, I've identified the issue:

**The terminal buffer (`lastOutputRef.current`) is NOT being populated with Copilot TUI output.**

## Evidence

1. **Test Results**: Automated test shows empty terminal buffer even though terminal is rendering
2. **Detection Logs**: All show `waiting: false` because buffer is empty
3. **Pattern Matching**: Patterns are correct and work in isolation
4. **Timing**: Changed from 1500ms to 500ms, increased buffer from 1000 to 3000 chars

## The Problem

When Copilot TUI renders its interface:
- xterm.js displays it correctly on screen
- BUT `lastOutputRef.current` buffer is not being updated
- Detection code checks the buffer, finds nothing
- Auto-respond never triggers

## Why This Happens

The `ws.onmessage` handler has these code paths:

```javascript
ws.onmessage = (event) => {
  let textData = '';
  
  if (/* binary data */) {
    textData = new TextDecoder().decode(data);
  } else if (typeof event.data === 'string') {
    if (str[0] === '{') {
      // JSON message
      const msg = JSON.parse(str);
      if (msg.error) return; // textData stays ''
      if (msg.type === 'VISION_OVERLAY') return; // textData stays ''
    } else {
      textData = str;
    }
  }
  
  // This line fails when textData is ''
  lastOutputRef.current = (lastOutputRef.current + textData).slice(-3000);
}
```

When JSON messages come through, `textData` stays empty and the buffer doesn't grow.

## The Real Issue

Looking at the test screenshots - **Copilot never actually ran**. The keyboard input from Playwright didn't reach the terminal.

But in YOUR production use:
1. You manually type `copilot` - this DOES work
2. Copilot TUI appears - you can SEE it
3. But the detection logs show `waiting: false`
4. This means the buffer is empty OR the patterns don't match

## Next Steps

We need to capture what's ACTUALLY in `lastOutputRef.current` when you see a Copilot prompt. The buffer scraping from Playwright doesn't work because it scrapes DOM, not the React ref.

**I need you to:**
1. Open production Forge (localhost:3005)
2. Open browser console (F12)
3. Enable auto-respond on a tab
4. Run `copilot` 
5. Ask to install python
6. When the prompt shows, run this in console:

```javascript
// Find the terminal component's fiber node
const terminalDiv = document.querySelector('.terminal-container');
const fiber = Object.keys(terminalDiv).find(key => key.startsWith('__reactFiber'));
const component = terminalDiv[fiber];

// Walk up to find ForgeTerminal component
let current = component;
while (current && (!current.memoizedProps || !current.memoizedProps.tabId)) {
  current = current.return;
}

// Get the refs
if (current) {
  console.log('Buffer length:', current.memoizedProps.lastOutputRef?.current?.length);
  console.log('Buffer contents (last 1000 chars):');
  console.log(current.memoizedProps.lastOutputRef?.current?.slice(-1000));
}
```

This will show me what's ACTUALLY in the buffer when the prompt is visible.
