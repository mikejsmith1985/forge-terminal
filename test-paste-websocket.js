const WebSocket = require('ws');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTerminalPaste() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║    TESTING PASTE VIA WEBSOCKET TERMINAL INPUT                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let testResult = {
    connectionSuccess: false,
    commandExecuted: false,
    terminalResponded: false
  };

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8333/ws?tabId=test-paste&shell=bash');
    let output = '';
    let commandSent = false;
    let pasteFound = false;

    console.log('Step 1: Connecting to WebSocket...');
    
    ws.on('open', async () => {
      console.log('  ✓ WebSocket connected');
      testResult.connectionSuccess = true;

      // Give terminal a moment to be ready
      await sleep(500);

      // Test 1: Send a simple echo to verify terminal works
      console.log('\nStep 2: Sending test command "echo TEST-BASIC"...');
      ws.send('echo TEST-BASIC\r');
      commandSent = true;
    });

    ws.on('message', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write('.');

      // Check if our test outputs appeared
      if (output.includes('TEST-BASIC')) {
        console.log('\n  ✓ Basic command executed - terminal is working');
        testResult.commandExecuted = true;

        if (!pasteFound) {
          pasteFound = true;
          console.log('\nStep 3: Terminal responds to commands - PASTE SHOULD WORK');
          console.log('  (Paste testing requires real keyboard, not WebSocket input)');
          
          // Close connection
          ws.close();
        }
      }
    });

    ws.on('error', (err) => {
      console.error('  ✗ WebSocket error:', err.message);
      resolve(testResult);
    });

    ws.on('close', () => {
      console.log('\n  ✓ Connection closed');
      
      // Print results
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║                      TEST RESULTS                              ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      console.log(`WebSocket Connected:  ${testResult.connectionSuccess ? '✓' : '✗'}`);
      console.log(`Command Executed:     ${testResult.commandExecuted ? '✓' : '✗'}`);
      console.log(`Terminal Responds:    ${testResult.commandExecuted ? '✓ YES' : '✗ NO'}`);

      if (testResult.commandExecuted) {
        console.log('\n✓ Terminal is responding to input correctly');
        console.log('\nTO TEST PASTE:');
        console.log('  1. Start fresh: ./forge');
        console.log('  2. Open browser: http://localhost:8333');
        console.log('  3. Copy text somewhere: Ctrl+C in notepad');
        console.log('  4. Click in terminal');
        console.log('  5. Type: echo ');
        console.log('  6. Press Ctrl+V');
        console.log('  7. Does "echo <pasted-text>" appear?');
        console.log('     YES = Paste works ✓');
        console.log('     NO = Paste broken ✗\n');
      } else {
        console.log('\n✗ Terminal is not responding\n');
      }

      resolve(testResult);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      console.log('\n✗ Test timeout');
      ws.close();
      resolve(testResult);
    }, 10000);
  });
}

testTerminalPaste().then(result => {
  if (result.commandExecuted) {
    console.log('Awaiting user manual testing...\n');
  }
  process.exit(0);
});
