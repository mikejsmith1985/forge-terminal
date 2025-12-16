#!/usr/bin/env node

/**
 * Forge Terminal Setup Wizard
 * Interactive CLI guide for GitHub Pages deployment
 * Run with: npx forge-setup-wizard or node setup-wizard.js
 */

const readline = require('readline');
const os = require('os');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function print(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function main() {
  print('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  print('║  🚀 FORGE TERMINAL - SETUP WIZARD                          ║', 'cyan');
  print('║     GitHub Pages Platform-Agnostic Deployment              ║', 'cyan');
  print('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  print('Welcome! Let me help you set up forge-terminal.', 'bright');
  print('This wizard will guide you through 4 deployment options.\n', 'bright');

  // Question 1: What's your comfort level?
  print('Step 1: How would you like to run forge-terminal?', 'yellow');
  print('─────────────────────────────────────────────────────────\n', 'yellow');

  print('1. 🖥️  LOCAL (Recommended)', 'green');
  print('   • Download binary → Use GitHub Pages frontend');
  print('   • Cost: FREE');
  print('   • Works: Unlimited');
  print('   • Best for: Daily development\n');

  print('2. 📦 EMBEDDED (Simplest)', 'green');
  print('   • Download binary → Everything included');
  print('   • Cost: FREE');
  print('   • Works: Unlimited');
  print('   • Best for: Quick setup, no configuration\n');

  print('3. ☁️  GITHUB CODESPACES (Cloud)', 'blue');
  print('   • Cloud-based, no local installation');
  print('   • Cost: FREE (120 hours/month), then $0.18/hour');
  print('   • Works: As long as budget allows');
  print('   • Best for: Testing without local setup\n');

  print('4. 💾 SELF-HOSTED (Advanced)', 'blue');
  print('   • Run backend on your own server');
  print('   • Cost: Depends on hosting (AWS, DigitalOcean, etc.)');
  print('   • Works: 24/7 with proper setup');
  print('   • Best for: Production-like environments\n');

  let choice = '';
  while (!['1', '2', '3', '4'].includes(choice)) {
    choice = await prompt('Select option (1-4): ');
  }

  let selectedMode = '';
  let instructions = '';

  // Generate instructions based on choice
  switch(choice) {
    case '1':
      selectedMode = 'LOCAL';
      instructions = generateLocalInstructions();
      break;
    case '2':
      selectedMode = 'EMBEDDED';
      instructions = generateEmbeddedInstructions();
      break;
    case '3':
      selectedMode = 'GITHUB CODESPACES';
      instructions = generateCodespacesInstructions();
      break;
    case '4':
      selectedMode = 'SELF-HOSTED';
      instructions = generateSelfHostedInstructions();
      break;
  }

  // Step 2: Confirm OS
  print('\n\nStep 2: What operating system are you using?', 'yellow');
  print('─────────────────────────────────────────────────────────\n', 'yellow');

  print('1. macOS (Intel)');
  print('2. macOS (Apple Silicon)');
  print('3. Linux (amd64)');
  print('4. Windows\n');

  let osChoice = '';
  while (!['1', '2', '3', '4'].includes(osChoice)) {
    osChoice = await prompt('Select OS (1-4): ');
  }

  let osName = '';
  let binaryName = '';

  switch(osChoice) {
    case '1':
      osName = 'macOS (Intel)';
      binaryName = 'forge-darwin-amd64';
      break;
    case '2':
      osName = 'macOS (Apple Silicon)';
      binaryName = 'forge-darwin-arm64';
      break;
    case '3':
      osName = 'Linux';
      binaryName = 'forge-linux-amd64';
      break;
    case '4':
      osName = 'Windows';
      binaryName = 'forge-windows-amd64.exe';
      break;
  }

  // Step 3: Generate summary
  print('\n\n╔════════════════════════════════════════════════════════════╗', 'green');
  print('║ ✅ SETUP SUMMARY                                            ║', 'green');
  print('╚════════════════════════════════════════════════════════════╝\n', 'green');

  print(`Mode:          ${selectedMode}`, 'bright');
  print(`OS:            ${osName}`, 'bright');
  print(`Binary:        ${binaryName}\n`, 'bright');

  print(instructions, 'cyan');

  // Step 4: Additional help
  print('\n\nNeed more help?', 'yellow');
  print('─────────────────────────────────────────────────────────\n', 'yellow');

  print('📖 Full documentation: docs/user/github-pages-deployment.md', 'blue');
  print('🐛 Report issues: github.com/mikejsmith1985/forge-terminal/issues', 'blue');
  print('❓ FAQ: See README.md section "GitHub Pages Setup"\n', 'blue');

  print('Happy coding! 🚀\n', 'green');

  rl.close();
}

function generateLocalInstructions() {
  return `
SETUP INSTRUCTIONS (LOCAL MODE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Download Binary
  → Visit: https://github.com/mikejsmith1985/forge-terminal/releases
  → Download: ${process.env.BINARY_NAME || 'forge-[os]-[arch]'}
  → Make executable: chmod +x forge-*

Step 2: Start Backend
  → In Terminal: ./forge-[os]-[arch]
  → Listens on: http://localhost:8333

Step 3: Open Frontend
  → In Browser: https://[username].github.io/forge-terminal/
  → Replace [username] with your GitHub username

Step 4: Configure API
  → Click: ⚙️ Settings (top-right)
  → Select: API Configuration
  → Enter: http://localhost:8333
  → Click: Test Connection
  → Click: Apply

Step 5: Start Using
  → Terminal is ready!
  → Create tabs, add commands, customize themes
  → All data saved to ~/.forge/

TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q: Port 8333 already in use?
A: Backend will auto-try: 8080, 9000, 3000, 3333
   Check logs for actual port

Q: Frontend won't connect?
A: 1. Verify backend is running
   2. Check firewall allows localhost
   3. Try http://127.0.0.1:8333 instead of localhost

Q: CORS error in browser console?
A: Update API Configuration with correct URL

FEATURES AVAILABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Full terminal with PTY support
✓ Multiple tabs (up to 20)
✓ Command cards with keyboard shortcuts
✓ 10+ color themes
✓ Per-tab light/dark mode
✓ Session persistence
✓ AM logging (session recovery)
✓ Auto-update checking
✓ WSL integration (Windows)
`;
}

function generateEmbeddedInstructions() {
  return `
SETUP INSTRUCTIONS (EMBEDDED MODE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Download Binary
  → Visit: https://github.com/mikejsmith1985/forge-terminal/releases
  → Download: ${process.env.BINARY_NAME || 'forge-[os]-[arch]'}
  → Make executable: chmod +x forge-*

Step 2: Run
  → In Terminal: ./forge-[os]-[arch]
  → Browser opens automatically at http://localhost:8333

Step 3: Start Using
  → Terminal is ready!
  → Frontend is embedded (no external access needed)
  → All data saved to ~/.forge/

THAT'S IT! No configuration needed.

FEATURES AVAILABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Full terminal with PTY support
✓ Multiple tabs (up to 20)
✓ Command cards with keyboard shortcuts
✓ 10+ color themes
✓ Per-tab light/dark mode
✓ Session persistence
✓ AM logging (session recovery)
✓ Auto-update checking
✓ WSL integration (Windows)

DIFFERENCES FROM LOCAL MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Embedded:
  • Frontend is included in binary
  • No external website needed
  • Can't access from other devices
  • Simplest setup

Local (with GitHub Pages):
  • Can access from GitHub Pages URL
  • Works from any device
  • Requires configuration
  • More features
`;
}

function generateCodespacesInstructions() {
  return `
SETUP INSTRUCTIONS (GITHUB CODESPACES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Create Codespace
  → Go to: https://github.com/mikejsmith1985/forge-terminal
  → Click: Code → Codespaces → Create codespace on main
  → Wait: 2-3 minutes for setup

Step 2: Build & Run Backend
  → In Codespace terminal:
    $ cd frontend && npm install
    $ cd ..
    $ make run
  → Listens on: http://localhost:8333 (inside container)

Step 3: Expose Port
  → Press: F1 (or Ctrl+Shift+P on Linux)
  → Type: Ports: Expose Port
  → Enter: 8333
  → Right-click port 8333 → Copy Forwarded Address
  → Save the URL (looks like: https://[id]-8333.app.github.dev)

Step 4: Open Frontend
  → In Browser: https://[username].github.io/forge-terminal/
  → Replace [username] with your GitHub username

Step 5: Configure API
  → Click: ⚙️ Settings (top-right)
  → Select: API Configuration
  → Enter: [Paste the forwarded URL from Step 3]
  → Click: Test Connection
  → Click: Apply

Step 6: Start Using
  → Terminal is ready!
  → Works from any browser
  → Access from any device

COST & LIMITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FREE TIER:
  • 120 hours/month (~4 hours/day)
  • 15 GB storage
  • Perfect for testing

PAID (if you exceed free tier):
  • $0.18/hour for 2-core machine
  • $0.07/GB for storage over 15 GB

RUNNING OUT OF FREE HOURS?
  → Simply fall back to LOCAL mode
  → Same features, same cost: FREE
  → No need to keep Codespace running

TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q: Can't find port 8333 in Ports panel?
A: Port might not be exposed yet. Run 'make run' to start backend

Q: Forwarded URL changes?
A: Each restart creates new URL. Always copy fresh URL from Ports panel

Q: WebSocket connection failed?
A: Use HTTPS (wss://) not HTTP. Copy from Ports panel (auto-HTTPS)

FEATURES AVAILABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Full terminal with PTY support
✓ Multiple tabs (up to 20)
✓ Command cards with keyboard shortcuts
✓ 10+ color themes
✓ Per-tab light/dark mode
✓ Session persistence
✓ AM logging (session recovery)
✓ Auto-update checking
`;
}

function generateSelfHostedInstructions() {
  return `
SETUP INSTRUCTIONS (SELF-HOSTED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Choose Hosting Provider
  Options:
  • DigitalOcean ($6-12/month)
  • AWS EC2 (t2.micro free tier eligible)
  • Linode ($5/month)
  • Your own server

Step 2: Build Binary
  On your server:
  $ git clone https://github.com/mikejsmith1985/forge-terminal.git
  $ cd forge-terminal
  $ cd frontend && npm install && npm run build && cd ..
  $ go build -o bin/forge ./cmd/forge

Step 3: Run Backend
  $ ./bin/forge
  → Listens on your server's IP + port 8333

Step 4: Setup Domain (Optional)
  • Point domain to server IP
  • Use reverse proxy (nginx) for HTTPS
  • Add to ALLOWED_ORIGINS environment variable

Step 5: Open Frontend
  → In Browser: https://[username].github.io/forge-terminal/
  → Or use custom domain if set up

Step 6: Configure API
  → Click: ⚙️ Settings
  → Select: API Configuration
  → Enter: https://your-server.com:8333 (or IP + port)
  → Click: Test Connection
  → Click: Apply

Step 7: Keep Running
  Use process manager to keep forge running:
  • systemd (Linux)
  • screen or tmux (any OS)
  • supervisor
  • Docker container

COST IMPLICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Budget Option (24/7):
  • DigitalOcean: $6-12/month
  • AWS t2.micro: FREE tier (first year)
  • Linode: $5-10/month

High Performance:
  • 4-core server: $20-50/month
  • Load balancing: $100+/month
  • CDN for frontend: $10-100+/month

SECURITY SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL:
  1. Use HTTPS (SSL certificate - Let's Encrypt is free)
  2. Set ALLOWED_ORIGINS environment variable
  3. Use firewall to limit access
  4. Keep system updated
  5. Monitor logs for suspicious activity

Example:
  $ export ALLOWED_ORIGINS="https://your-domain.com,https://github.io"
  $ ./bin/forge

ADVANCED SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Docker:
  • Build Docker image
  • Run in container
  • Easier deployment & scaling

Kubernetes:
  • For multiple instances
  • Auto-scaling
  • High availability

Reverse Proxy (nginx):
  • HTTPS termination
  • Load balancing
  • Security headers

FEATURES AVAILABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Full terminal with PTY support
✓ Multiple tabs (up to 20)
✓ Command cards with keyboard shortcuts
✓ 10+ color themes
✓ Per-tab light/dark mode
✓ Session persistence
✓ AM logging (session recovery)
✓ Auto-update checking
✓ 24/7 availability (if server stays up)

WHEN TO USE SELF-HOSTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Need 24/7 availability
✓ Multiple team members sharing
✓ Production environment
✓ High security requirements
✓ Custom domain branding
✗ Just want to try it → Use LOCAL or EMBEDDED instead
`;
}

main().catch(err => {
  print(`Error: ${err.message}`, 'red');
  process.exit(1);
});
