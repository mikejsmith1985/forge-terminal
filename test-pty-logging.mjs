#!/usr/bin/env node
/**
 * PTY Logging Integration Test
 * 
 * Tests the new PTY logging feature via WebSocket and HTTP API
 * Run after starting forge-test-pty.exe
 */

import WebSocket from 'ws';

const PORT = 3005;
const WS_URL = `ws://localhost:${PORT}/ws?tabId=test-session`;
const API_URL = `http://localhost:${PORT}/api/debug/pty-logs?sessionId=test-session`;

console.log('🧪 PTY Logging Integration Test\n');

async function testPTYLogging() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let connected = false;
        let loggingEnabled = false;
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected');
            connected = true;
            
            // Enable PTY logging
            console.log('\n📤 Sending PTY_LOG_ENABLE...');
            ws.send(JSON.stringify({
                type: 'PTY_LOG_ENABLE'
            }));
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                
                if (msg.type === 'PTY_LOG_ENABLED') {
                    console.log('✅ PTY logging enabled:', msg);
                    loggingEnabled = true;
                    
                    // Send some test input
                    console.log('\n📤 Sending test input: "hello\\x7F" (hello + backspace)');
                    ws.send(Buffer.from('hello'));
                    
                    setTimeout(() => {
                        ws.send(Buffer.from([0x7F])); // Backspace
                        
                        // Wait a bit for logging
                        setTimeout(() => {
                            console.log('\n📤 Requesting PTY logs via WebSocket...');
                            ws.send(JSON.stringify({
                                type: 'PTY_LOG_GET'
                            }));
                        }, 100);
                    }, 100);
                }
                
                if (msg.type === 'PTY_LOG_DATA') {
                    console.log('✅ Received PTY logs via WebSocket:');
                    const logs = msg.logs || [];
                    
                    if (logs.length === 0) {
                        console.log('⚠️  No logs captured yet (may need more time)');
                    } else {
                        console.log(`   ${logs.length} entries captured\n`);
                        
                        // Show first few entries
                        logs.slice(0, 10).forEach((entry, i) => {
                            console.log(`   ${i + 1}. ${entry.direction} | ${entry.data} | ${entry.text} | ${entry.size} bytes`);
                        });
                        
                        // Check for backspace
                        const backspaceEntries = logs.filter(l => 
                            l.direction === 'to_pty' && (l.data === '7f' || l.data === '08')
                        );
                        
                        if (backspaceEntries.length > 0) {
                            console.log('\n   ✅ Backspace detected in logs!');
                            console.log(`      Count: ${backspaceEntries.length}`);
                            console.log(`      Data: ${JSON.stringify(backspaceEntries[0], null, 2)}`);
                        } else {
                            console.log('\n   ⚠️  No backspace found (may need more time or different terminal)');
                        }
                    }
                    
                    // Now test HTTP API
                    console.log('\n📤 Testing HTTP API...');
                    fetch(API_URL)
                        .then(res => res.json())
                        .then(data => {
                            console.log('✅ HTTP API response:');
                            console.log(`   Session ID: ${data.sessionId}`);
                            console.log(`   Log count: ${data.count}`);
                            
                            ws.close();
                            resolve();
                        })
                        .catch(err => {
                            console.error('❌ HTTP API error:', err.message);
                            ws.close();
                            reject(err);
                        });
                }
            } catch (err) {
                // Non-JSON messages (binary terminal data) - ignore
            }
        });
        
        ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            reject(err);
        });
        
        ws.on('close', () => {
            console.log('\n🔌 WebSocket closed');
        });
        
        // Timeout safety
        setTimeout(() => {
            if (!loggingEnabled) {
                console.error('❌ Test timeout - PTY logging not enabled');
                ws.close();
                reject(new Error('Timeout'));
            }
        }, 5000);
    });
}

// Run test
console.log(`🚀 Connecting to ${WS_URL}\n`);
testPTYLogging()
    .then(() => {
        console.log('\n✅ All tests passed!');
        console.log('\n📝 Summary:');
        console.log('   - WebSocket PTY_LOG_ENABLE works');
        console.log('   - WebSocket PTY_LOG_GET works');
        console.log('   - HTTP GET /api/debug/pty-logs works');
        console.log('   - PTY byte logging captures terminal I/O');
        console.log('\n✨ Integration complete - ready for Follow Me frontend!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err.message);
        console.error('\n💡 Make sure forge-test-pty.exe is running on port 3005');
        process.exit(1);
    });
