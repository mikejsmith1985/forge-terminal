const WebSocket = require('ws');

// Connect to the Forge Terminal WebSocket
const ws = new WebSocket('ws://localhost:9999/ws?shell=powershell&tabID=test-injection');

ws.on('open', () => {
  console.log('✓ WebSocket connected');
  
  // Step 1: Send persistent instruction config
  const config = {
    type: 'PROMPT_INJECTION_CONFIG',
    enabled: true,
    instruction: 'DETERMINISTIC_TEST_12345'
  };
  
  ws.send(JSON.stringify(config));
  console.log('✓ Sent config:', JSON.stringify(config));
  
  // Wait for config to be processed
  setTimeout(() => {
    // Step 2: Send a test LLM command
    console.log('\n--- Testing regular command (should NOT be injected) ---');
    ws.send('echo "regular command"\r');
    
    setTimeout(() => {
      // Step 3: Send an LLM command that SHOULD be injected
      console.log('\n--- Testing LLM command (SHOULD be injected) ---');
      ws.send('copilot test prompt\r');
      
      setTimeout(() => {
        console.log('\n✓ Test commands sent. Check backend logs for:');
        console.log('  [ContextManager] Injecting persistent instruction for session...');
        ws.close();
      }, 2000);
    }, 2000);
  }, 1000);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.type === 'PROMPT_INJECTION_CONFIRMED') {
      console.log('✓ Backend confirmed config:', msg);
    }
  } catch (e) {
    // Binary/terminal data, ignore for this test
  }
});

ws.on('error', (err) => {
  console.error('✗ WebSocket error:', err);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n✓ WebSocket closed');
  process.exit(0);
});
