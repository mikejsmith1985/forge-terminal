# Forge Companion

**Forge Companion** is a lightweight mobile PWA (Progressive Web App) that lets you view and
interact with your Forge Terminal sessions from any iOS or Android device — no native app
installation required.

---

## Requirements

- **Forge Terminal v7.6.0+** running on your desktop
- **Mobile Access** feature enabled in Forge → Settings → Mobile Access
- A public tunnel URL pointing at your Forge instance (e.g. via Cloudflare Tunnel, ngrok,
  or Tailscale)

---

## Quick Start

### Option A — QR Code (Recommended)

1. Open Forge → Settings → Mobile Access
2. Click **Enable Mobile Access**
3. Scan the displayed QR code with your phone — it opens the companion with your credentials pre-filled
4. Tap **Connect**

### Option B — Manual

1. Open Forge → Settings → Mobile Access and copy the **Mobile Token** shown there
2. Open `index.html` in a web browser on your desktop, or host it at a stable URL (see below)
3. Enter your tunnel URL (e.g. `https://xyz.trycloudflare.com`) and the mobile token
4. Tap **Connect**

---

## Hosting the Companion App

The companion is a single `index.html` file with no build step. You have several options:

### GitHub Pages (Free)

Fork this directory into its own repo, enable GitHub Pages, and share the URL with your phone.

### Local File (Development)

Open `index.html` directly in your browser (works for same-device testing via localhost):

```
file:///path/to/forge-companion/index.html
```

> Note: CORS restrictions mean you can only use `file://` for Forge instances on the
> same machine running the companion. For phone access, hosting on HTTPS is required.

### Hosting via Forge Tunnel

If your Forge instance is already behind a Cloudflare Tunnel, you can serve the companion
files from a static asset host alongside the tunnel domain.

---

## Mobile Access Feature Gate

Mobile access is a **paid add-on**. When you first connect, the companion checks your Forge
instance's feature flags. If mobile access is not enabled, you'll see an upgrade prompt
linking to [rootlevellabs.tech/upgrade](https://rootlevellabs.tech/upgrade).

---

## Security Notes

- The **mobile token** is different from your MCP token — it only has terminal read/write access
- The token is stored in `~/.forge/mobile-token` on your desktop and in `localStorage` on your phone
- Credentials stored in `localStorage` are sandboxed to the companion app's origin
- The deep-link token (`#token=...`) is passed via URL fragment and is never sent in HTTP requests

---

## Adding to Home Screen

For the best experience, add the companion to your phone's home screen:

**iOS (Safari):** Share → Add to Home Screen  
**Android (Chrome):** Menu → Add to Home Screen / Install App

Once installed, it runs in standalone mode (no browser chrome) and caches the app shell
for offline resilience.

---

## API Endpoints Used

All requests go to `/api/mobile/*` on your Forge instance:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mobile/info` | GET | Validates token, returns version + feature state |
| `/api/mobile/sessions` | GET | Lists active PTY sessions |
| `/api/mobile/exec` | POST | Sends a command to a session |
| `/api/mobile/read` | GET | Returns scrollback (plain text, ANSI stripped) |

---

## Troubleshooting

**"Invalid token"** — Copy the token from Forge → Settings → Mobile Access. It's different
from the MCP token shown in the MCP command card.

**"Could not reach Forge"** — Verify your tunnel is running and the URL has no trailing slash.
Try opening `https://YOUR-URL/api/mobile/info` in your phone's browser with the token in the
Authorization header to test connectivity.

**Blank terminal output** — The session may have ended. Go back to Sessions and refresh.
