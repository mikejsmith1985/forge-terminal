/**
 * tourSteps.js - Hosted Mode Tour for Forge Terminal v4.0.0
 *
 * Interactive guided tour explaining Forge's hosted mode:
 * - What hosted mode is and how it works
 * - How to set it up (--hosted flag, QR pairing, tunnels)
 * - Mobile-optimized UI features
 * - PWA capabilities (install, offline, wake lock, notifications)
 * - Connection resilience (grace period, reconnection, buffering)
 * - Advanced features (clipboard bridge, file upload, voice input)
 * - Advantages and limitations
 */

const TOUR_STEPS = [
  // ============================================================================
  // WELCOME & CONCEPT
  // ============================================================================
  {
    id: 'welcome',
    selector: null,
    title: 'Welcome to Forge Hosted Mode! \ud83d\udcf1',
    content: 'Forge can now run as a **hosted server** on your PC, accessible from your phone\'s browser \u2014 or any device on the network. This tour explains how it works, how to set it up, and what to expect.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'what-is-hosted',
    selector: null,
    title: 'What is Hosted Mode?',
    content: 'Hosted mode turns Forge into a **remote-accessible terminal server**. Your PC runs the terminal sessions, while your phone (or tablet, or another computer) connects through a browser.\n\nIt\'s like SSH \u2014 but with a full graphical UI, no client setup, and mobile-optimized controls.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'how-it-works',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Your Real Terminal, Anywhere',
    content: 'This terminal runs on your PC as a real PTY process. Every command you type on your phone executes here. The connection uses WebSockets for real-time I/O \u2014 it feels instant, even over cellular.',
    placement: 'center',
    spotlight: true,
    arrow: 'down-left',
  },

  // ============================================================================
  // SETUP & CONFIGURATION
  // ============================================================================
  {
    id: 'setup-hosted-flag',
    selector: null,
    title: 'Starting Hosted Mode',
    content: '**The easiest way** is to click the QR code button (📶) in the sidebar — right next to the Settings gear. It opens the Remote Access panel where you can start the tunnel and scan the QR code without leaving the app.\n\nAlternatively, launch Forge from your OS terminal with:\n```\nforge --hosted\n```\nThis auto-starts the tunnel on launch and prints the QR code to the console.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'qr-pairing',
    selector: null,
    title: 'Getting the QR Code \ud83d\udcf7',
    content: 'After running `forge --hosted`, look at **the console window where you launched Forge** (not this browser window). You\'ll see:\n\n```\n🔥 Forge Terminal starting at http://0.0.0.0:3000\n🌐 Tunnel URL: https://abc123.trycloudflare.com\n\n█▀▀▀█ ▀ █▀▀▀█\n█ ▄ █ ▀ █ ▄ █   ← QR code here\n...\n\n📱 Scan to connect: https://abc123.trycloudflare.com?token=...\n```\n\nPoint your phone camera at the QR code — the URL bakes in your auth token so you\'re **instantly signed in**. No passwords to type on a tiny keyboard!',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'security-overview',
    selector: null,
    title: 'Security Built In \ud83d\udd12',
    content: '**Hosted mode is secured by default:**\n\n\u2022 **Token auth** \u2014 every request requires a cryptographic token\n\u2022 **Rate limiting** \u2014 per-IP throttling blocks brute-force attacks\n\u2022 **CSP headers** \u2014 strict Content-Security-Policy prevents injection\n\u2022 **HTTPS** \u2014 Cloudflare tunnel provides end-to-end encryption\n\u2022 **Self-signed TLS** \u2014 available for direct LAN connections',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'tunnel-explained',
    selector: null,
    title: 'Cloudflare Tunnel \u2014 No Port Forwarding',
    content: 'The Cloudflare tunnel creates a **secure public URL** (like abc123.trycloudflare.com) that routes to your PC. No router config, no firewall rules, no dynamic DNS.\n\nWorks from anywhere \u2014 coffee shop, cellular, another country. The tunnel is ephemeral and closes when Forge stops.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'tls-lan',
    selector: null,
    title: 'LAN Access with TLS',
    content: 'For **local network** use (same Wi-Fi), Forge can generate a self-signed TLS certificate. This encrypts traffic between your phone and PC without needing Cloudflare.\n\nThe cert includes your PC\'s local IP addresses as Subject Alternative Names, so browsers accept it after a one-time trust prompt.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // MOBILE UI
  // ============================================================================
  {
    id: 'mobile-ui-overview',
    selector: null,
    title: 'Mobile-Optimized Interface \ud83d\udcf1',
    content: 'When you open Forge on a phone, the UI automatically adapts:\n\n\u2022 **Drawer sidebar** \u2014 slides in from the left, doesn\'t steal screen space\n\u2022 **Floating input bar** \u2014 always visible above the keyboard\n\u2022 **Horizontal tab strip** \u2014 swipe between tabs\n\u2022 **44px touch targets** \u2014 every button is finger-friendly\n\u2022 **Swipe gestures** \u2014 swipe right to open sidebar',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'mobile-input',
    selector: null,
    title: 'Typing on Mobile \u2014 Solved',
    content: 'Terminal input on phones is notoriously hard. Forge solves this with a **hybrid input system**:\n\n\u2022 A floating text input bar sits above the keyboard\n\u2022 A **special key toolbar** provides: Tab, Esc, Ctrl, arrow keys, Ctrl+C, Ctrl+D\n\u2022 Ctrl acts as a toggle \u2014 tap it, then tap a letter for Ctrl+combos\n\u2022 The virtual keyboard\'s autocorrect is disabled to prevent mangling commands',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'mobile-tabs',
    selector: '.tab-bar',
    fallbackSelector: '.tabs-container',
    title: 'Tabs on Mobile',
    content: 'On your phone, tabs appear as a **horizontal scroll strip** with scroll-snap. Swipe left/right to find your tab, tap to switch, tap X to close. A + button at the end creates new tabs.\n\nOn desktop, you see the regular tab bar \u2014 the mobile strip only appears on small screens.',
    placement: 'center',
    spotlight: true,
    arrow: 'up',
  },

  // ============================================================================
  // PWA FEATURES
  // ============================================================================
  {
    id: 'pwa-install',
    selector: null,
    title: 'Install as a Phone App',
    content: 'Forge is a **Progressive Web App (PWA)**. On your phone, tap "Add to Home Screen" in your browser menu. This gives you:\n\n\u2022 A **standalone app** \u2014 no browser chrome, full-screen terminal\n\u2022 An **app icon** on your home screen\n\u2022 **Faster launch** \u2014 no typing URLs\n\nIt looks and feels like a native app.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'pwa-offline',
    selector: null,
    title: 'Offline App Shell',
    content: 'A **service worker** caches the app shell (HTML, CSS, JS) so the UI loads instantly \u2014 even if your connection drops briefly. API calls and WebSocket data always go to the network.\n\nThis means you see the UI immediately on launch, then it connects to your PC.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // CONNECTION RESILIENCE
  // ============================================================================
  {
    id: 'connection-resilience',
    selector: null,
    title: 'Built for Unreliable Networks \ud83d\udcf6',
    content: 'Mobile connections drop. Forge is designed for this:\n\n\u2022 **30-minute grace period** \u2014 your terminal session stays alive on the server even if you disconnect. Desktop gets 5 minutes; mobile gets 30.\n\u2022 **Output buffering** \u2014 a 1MB ring buffer captures terminal output while you\'re offline. When you reconnect, you see everything you missed.\n\u2022 **Auto-reconnect** \u2014 exponential backoff with jitter prevents thundering herds.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'network-indicator',
    selector: null,
    title: 'Network Status Indicator',
    content: 'A small indicator shows your connection health:\n\n\u2022 \ud83d\udfe2 **Green** \u2014 connected, low latency\n\u2022 \ud83d\udfe1 **Yellow** \u2014 connected but slow, or reconnecting\n\u2022 \ud83d\udd34 **Red** \u2014 disconnected, attempting to reconnect\n\nYou always know if your commands are reaching your PC.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // ADVANCED MOBILE FEATURES
  // ============================================================================
  {
    id: 'wake-lock',
    selector: null,
    title: 'Screen Wake Lock \u2600\ufe0f',
    content: 'When connected from mobile, Forge requests a **Screen Wake Lock** so your phone\'s display doesn\'t turn off while you\'re watching a long build or deployment.\n\nIf you switch apps and come back, the lock re-acquires automatically.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'notifications',
    selector: null,
    title: 'Push Notifications \ud83d\udd14',
    content: 'Grant notification permission and Forge will alert you when **commands complete** while you\'re in another app:\n\n\u2022 \u2705 "Command Complete" \u2014 exit code 0\n\u2022 \u274c "Command Failed" \u2014 non-zero exit\n\nTap the notification to jump back to Forge. Notifications only fire when the tab is in the background.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'clipboard-bridge',
    selector: null,
    title: 'Clipboard Bridge \ud83d\udccb',
    content: 'Copy text between your phone and PC seamlessly. The clipboard bridge uses WebSocket messages to sync content:\n\n\u2022 **Phone \u2192 PC**: Copy text from your phone\'s browser and send it to the server\n\u2022 **PC \u2192 Phone**: Request clipboard content from the server\n\nClipboard data expires after 5 minutes for security.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'file-upload',
    selector: null,
    title: 'Upload Files from Phone \ud83d\udcc1',
    content: 'Need to get a file from your phone to your PC? The **file upload** button (visible on mobile) lets you pick any file \u2014 photos, documents, downloads \u2014 and upload it directly to your Forge working directory.\n\nPerfect for uploading screenshots, configs, or SSH keys.',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'voice-input',
    selector: null,
    title: 'Voice Input \ud83c\udfa4',
    content: 'On supported browsers (Chrome, Edge, Safari), you can **speak commands** instead of typing. The Web Speech API converts speech to text and sends it to the terminal.\n\nGreat for quick commands when you don\'t want to type on a small screen: "git status", "npm run build", "cd projects".',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // ADVANTAGES & LIMITATIONS
  // ============================================================================
  {
    id: 'advantages',
    selector: null,
    title: 'Advantages \u2705',
    content: '**Why use hosted mode?**\n\n\u2022 **Zero setup on client** \u2014 just a browser, no SSH keys or apps to install\n\u2022 **Full PC power** \u2014 your phone is just a display; builds run on your desktop CPU/RAM\n\u2022 **Works anywhere** \u2014 Cloudflare tunnel means no network configuration\n\u2022 **Mobile-first UX** \u2014 not a scaled-down desktop, but purpose-built mobile controls\n\u2022 **Session persistence** \u2014 disconnect and reconnect without losing state\n\u2022 **PWA experience** \u2014 feels like a native app on your phone',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'limitations',
    selector: null,
    title: 'Limitations & Considerations \u26a0\ufe0f',
    content: '**What to be aware of:**\n\n\u2022 **PC must be running** \u2014 if your computer sleeps or shuts down, sessions end\n\u2022 **Latency** \u2014 Cloudflare tunnel adds ~50-100ms; fine for typing, noticeable for interactive TUIs like vim\n\u2022 **Self-signed TLS** \u2014 browsers show a warning on first LAN connection\n\u2022 **Mobile keyboards** \u2014 special keys help, but complex vim/emacs workflows are still challenging\n\u2022 **Security responsibility** \u2014 your token is the only thing between the internet and your terminal',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'best-practices',
    selector: null,
    title: 'Best Practices \ud83d\udca1',
    content: '**For the best experience:**\n\n\u2022 Install as PWA on your phone for standalone mode\n\u2022 Use a strong, unique auth token (auto-generated by default)\n\u2022 On trusted LANs, use direct IP + TLS instead of Cloudflare for lower latency\n\u2022 Keep Forge updated \u2014 hosted mode security patches are critical\n\u2022 Use the Ctrl toggle + letter keys for terminal control sequences\n\u2022 Grant notification permission so you know when long commands finish',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // COMPLETION
  // ============================================================================
  {
    id: 'complete',
    selector: null,
    title: 'Ready to Go Remote! \ud83d\ude80',
    content: '**Quick start:**\n\n1. Run: forge --hosted\n2. Scan the QR code with your phone\n3. Tap "Add to Home Screen" for the PWA\n4. Start running commands from anywhere!\n\nReplay this tour anytime from Settings \u2192 Shell tab. Happy remote hacking!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

const TOUR_STORAGE_KEY = 'forge_tour_completed';
const TOUR_VERSION = '4.1.4'; // v4.0.2: Clarified QR code steps; added in-app Remote Access button

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
