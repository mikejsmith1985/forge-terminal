# Forge Companion

**Forge Companion** is a mobile app (PWA) that lets you view and control your Forge Terminal
sessions from any phone — no app store required, just scan a QR code.

---

## What you need

- **Forge Terminal v7.6.0+** running on your desktop
- **A Cloudflare Tunnel link** so your phone can reach your computer (free — see Step 1 below)
- **Forge Companion subscription** (enable it from the Forge Companion card in the sidebar)

---

## Quick Start — 5 easy steps

### Step 1 — Get a free tunnel link

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and run:

```
cloudflared tunnel --url http://localhost:3005
```

It prints a link like `https://abc123.trycloudflare.com`. **Copy that link.**

> **Why?** Your phone needs a public web address to reach your computer. The tunnel creates one in seconds.

---

### Step 2 — Enable mobile access

Click the **Forge Companion** card in the Forge sidebar and click **Enable Mobile Access**.

---

### Step 3 — Paste your tunnel link

Paste the link from Step 1 into the **"Your public Forge URL"** box in the card.

---

### Step 4 — Scan the QR code

Point your phone camera at the QR code that appears. It opens the Forge Companion app
automatically — no typing needed.

---

### Step 5 — Tap Connect

Tap **Connect** in the app. Your terminal sessions appear on screen. You're done! 🎉

---

## Add to home screen (recommended)

For the best experience, save it like a real app:

**iPhone (Safari):** Tap the Share button → **Add to Home Screen**  
**Android (Chrome):** Tap the menu (⋮) → **Add to Home Screen** or **Install App**

---

## Troubleshooting

**"Could not reach Forge"** — Make sure your tunnel is still running (`cloudflared tunnel --url ...`)
and paste the current tunnel URL. Tunnel URLs change each time you restart cloudflared.

**"Invalid token"** — Click the Forge Companion card in the sidebar and tap **Copy** next to
the Mobile Token. Paste it manually in the app's token field.

**Blank screen after connecting** — Go back to the Sessions list and tap Refresh.

---

## Self-hosting the companion app

The companion is a single HTML file with no build step. The default hosted version lives at
[forge-companion-1b3.pages.dev](https://forge-companion-1b3.pages.dev/).

To self-host, copy `index.html`, `manifest.json`, and `sw.js` to any static web host (GitHub
Pages, Netlify, Cloudflare Pages, etc.) and enter that URL in the **Companion PWA host** field
in the Forge Companion card.

---

## Security

- The mobile token only grants terminal read/write access — it cannot access your files or vault
- The token is stored in `~/.forge/mobile-token` on your desktop and in `localStorage` on your phone
- The QR deep-link passes credentials via URL fragment (`#token=...`) — never in HTTP requests

