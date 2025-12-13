// ==========================================
//  SAVE CONVERSATION COMMAND
// ==========================================
export const saveConversation = {
  name: "save",
  description: "Manually save current conversation to AM logs",
  usage: "/save [description]",
  
  async run({ args, print, tabId, tabName }) {
    const description = args.join(' ') || 'Manual save';
    
    print(`\n📝 Saving conversation: "${description}"`);
    print("This will capture the terminal output buffer and save it to AM...\n");
    
    // Get terminal buffer content
    const xtermTextarea = document.querySelector('.xterm-helper-textarea');
    if (!xtermTextarea) {
      print("✗ Error: Terminal not found");
      return;
    }
    
    // Get the xterm instance - it's stored in the Terminal component
    const terminalEl = document.querySelector('.xterm');
    if (!terminalEl) {
      print("✗ Error: Terminal element not found");
      return;
    }
    
    // Try to get buffer from xterm (this is hacky but works)
    let bufferContent = '';
    try {
      // Get all visible lines from the terminal
      const rows = terminalEl.querySelectorAll('.xterm-rows > div');
      bufferContent = Array.from(rows)
        .map(row => row.textContent)
        .filter(line => line.trim())
        .join('\n');
      
      if (!bufferContent) {
        print("✗ Error: No terminal content found");
        return;
      }
      
      print(`✓ Captured ${bufferContent.length} characters from terminal buffer`);
    } catch (err) {
      print(`✗ Error capturing buffer: ${err.message}`);
      return;
    }
    
    // Save to AM
    try {
      const response = await fetch('/api/am/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabId: tabId || 'unknown',
          tabName: tabName || 'Terminal',
          workspace: window.location.pathname,
          entryType: 'MANUAL_SAVE',
          content: bufferContent,
          metadata: {
            description,
            timestamp: new Date().toISOString(),
            manualSave: true,
          }
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        print(`✓ Conversation saved to AM`);
        print(`  File: ${data.filename || 'unknown'}`);
        print(`  Size: ${bufferContent.length} bytes`);
        print(`  Description: ${description}`);
      } else {
        print(`✗ Server error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      print(`✗ Failed to save: ${err.message}`);
    }
    
    print("\nTo verify: Check ~/.forge/am/ for the latest .json file");
  }
};
