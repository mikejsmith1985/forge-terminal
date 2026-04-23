# Mobile Access — Setup Guide

*As of v7.6.29, Forge Terminal unifies four ways to reach your workshop
from a phone, tablet, or laptop under one **Connection Setup** flow.
This document walks through each option and explains when to pick what.*

## The four access modes

| Mode | Stability | Bandwidth | Setup effort | Best for |
|---|---|---|---|---|
| **Named Cloudflare Tunnel** | 🟢 Stable hostname (`forge.example.com`) | Unmetered | ~10 min, one-time | Daily driver — mount to home screen, always works |
| **Tailscale Funnel** | 🟢 Stable Magic DNS | Limited | Install Tailscale + enable Funnel | If you already use Tailscale |
| **Quick Tunnel** | 🟡 Ephemeral URL (`*.trycloudflare.com`) | Unmetered | Zero — always on | Casual / testing / first run |
| **LAN** | 🟢 Only on your Wi-Fi | Unlimited | Zero | Same network as the machine |

Forge **always runs at least one** of these and exposes a health-ranked
list to the frontend at `GET /api/tunnel/options`.

## Recommended setup: Named Tunnel

A Named Tunnel gives you a permanent HTTPS URL like
`https://forge.example.com`. It survives reboots, network changes, and
Forge restarts.

### Prerequisites

- A domain managed by Cloudflare (free plan is fine)
- Admin access to your Forge Terminal's host machine

### One-time setup

1. Open Forge Terminal.
2. Go to **Settings → Connection Setup → Named Tunnel**.
3. Click **Install cloudflared**. Forge downloads the right binary into
   `~/.forge/bin/` — no system-level installer, no admin prompt.
4. Click **Log in with Cloudflare**. Forge runs `cloudflared tunnel
   login` and extracts the OAuth URL from the process output; click the
   link on the host if a browser doesn't open automatically. If you're
   on SSH, copy the URL into your laptop's browser.
5. After you authorize in the browser, `cert.pem` lands in
   `~/.cloudflared/` and the wizard advances to **Pick Domain**.
6. Select the zone you want to host Forge under and click **Create**.
   Forge creates the tunnel, routes DNS, writes `config.yml`, and
   starts the supervisor. The QR code on the dashboard now points at
   your new hostname.

### What's stored where

| Path | Purpose | Permissions |
|---|---|---|
| `~/.cloudflared/cert.pem` | Your Cloudflare origin cert — auths the tunnel API | `0600` (POSIX) / ACL restricted to you + SYSTEM (Windows) |
| `~/.forge/tunnel/<uuid>.json` | Tunnel credentials | same |
| `~/.forge/tunnel/config.yml` | cloudflared runtime config | same |
| `~/.forge/tunnel/state.json` | Wizard completion marker | same |
| `~/.forge/tunnel/preference.json` | Which mode you selected (if not auto) | same |

Forge hardens these automatically after every `CreateNamedTunnel`. On
POSIX that's `chmod 0700/0600`; on Windows it's `icacls /inheritance:r`
plus an explicit grant for your user and the `SYSTEM` account (so
Windows Update and service recovery still work).

### Running as a Windows service (optional)

If you want the tunnel to come back after reboot even before you log in:

1. Go to **Settings → Connection Setup → Named Tunnel → Run as service**.
2. Click **Install service**. Forge shells out to `cloudflared service
   install` and queries `sc query cloudflared` to confirm the service
   state.
3. The service runs as SYSTEM and reads the same `config.yml` you just
   created.

To uninstall, click **Uninstall service** in the same panel.

## Alternative: Tailscale Funnel

If you already run Tailscale on your workshop machine and the companion
device, you can skip Cloudflare entirely:

1. `tailscale up` on the host.
2. `tailscale funnel --bg --https=443 http://localhost:8333` (or
   whichever port Forge is bound to).
3. Forge auto-detects the `Self.DNSName` and surfaces it under
   **Connection Setup → Tailscale**.

Tailscale Funnel is free for personal use with caps on total data. For
a Forge Terminal doing occasional companion notifications, you'll never
hit them.

## Fallback: Quick Tunnel

If you don't want to set anything up, Forge always runs a Quick Tunnel
in the background. The URL changes every restart — that's the tradeoff
for zero setup. Quick Tunnel links are wildcarded in the CSP
(`*.trycloudflare.com`), so the companion can always reach them.

## Fallback: LAN

When nothing else works — offline, no tunnel dependencies installed —
Forge prints the LAN URL in the startup banner and the dashboard. Use
it when your phone is on the same Wi-Fi as the workshop machine.

## Switching between modes

The frontend Connection Setup card shows **every** mode with a live
health state. To override the ranker's pick:

1. Click the three-dot menu next to a mode.
2. Click **Make default**.
3. Forge writes your choice to `~/.forge/tunnel/preference.json` and
   future sessions honour it unless that mode drops out of
   `Healthy`/`Configured`.

To clear your preference and go back to auto-pick, click **Clear
preference** in the same menu.

## Migrating from the old token-based Cloudflare flow

Forge Terminal v7.6.28 and earlier supported a token-based Cloudflare
named tunnel path driven by **Settings → Connections**. The v7.6.29
wizard uses the cert.pem flow instead (more flexible — no hard-coded
token, supports zone-picker DNS routing, survives token rotation).

If you still have the old config, Forge will show a one-time migration
prompt sourced from `GET /api/tunnel/migrate-legacy`. The migration is
**non-destructive** — your old token-based tunnel keeps working until
you delete it in Cloudflare Zero Trust. To upgrade, run the new wizard;
when you're satisfied the new tunnel works, you can decommission the
old one.

## The companion deep-link QR

The QR code on the Forge dashboard encodes a deep link like:

```
https://forge.example.com/companion/#forge=https%3A%2F%2Fforge.example.com&token=xyz
```

The `#` makes the rest a hash fragment — the token **never** reaches
the server as part of the URL path, so it won't appear in access logs
or proxy traces. Refreshing the companion in a browser keeps you
logged in; no re-scan needed.

## Troubleshooting

### "launch tunnel then QR 404" no longer happens

The Named Tunnel supervisor now only advances to `Healthy` after a
successful `/api/ping` probe, so the QR is only surfaced when the
backing service is actually reachable.

### "Repair tunnel" hint

If the supervisor crashes 5 times in 2 minutes, it surfaces an
actionable `RecoveryHint` in the health state. Usually this means
`cloudflared` can't reach Cloudflare's edge — check your firewall and
DNS.

### Resetting everything

```bash
rm -rf ~/.forge/tunnel
cloudflared tunnel delete forge-<your-slug>  # optional
```

Restart Forge. The wizard returns to the blank state.

## API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/tunnel/options` | GET | Ranked list of all modes + active + preference |
| `/api/tunnel/select` | POST | `{mode}` persist or clear user preference |
| `/api/tunnel/setup/install` | POST | Download cloudflared into `~/.forge/bin` |
| `/api/tunnel/setup/login` | POST | Start `cloudflared tunnel login` |
| `/api/tunnel/setup/login/status` | GET | Poll auth URL + cert.pem detection |
| `/api/tunnel/setup/login/cancel` | POST | Kill in-flight login |
| `/api/tunnel/setup/zones` | GET | List Cloudflare zones via cert.pem token |
| `/api/tunnel/setup/create` | POST | Create/adopt tunnel + route DNS + write config |
| `/api/tunnel/setup/status` | GET | Full wizard state (installed/loggedIn/created+config) |
| `/api/tunnel/setup/service` | GET/POST/DELETE | Windows service status / install / uninstall |
| `/api/tunnel/migrate-legacy` | GET | Detect legacy token-based config for upgrade prompt |

All endpoints require the server-wide auth token (same rules as every
other `/api/*` route).
