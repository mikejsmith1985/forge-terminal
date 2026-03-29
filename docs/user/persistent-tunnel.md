# Persistent Remote Access via Cloudflare Named Tunnel

By default, Forge's **Remote Access** feature creates an ephemeral Cloudflare Quick Tunnel. The URL (e.g. `https://random-words.trycloudflare.com`) changes every time you start Forge. This is fine for one-off sessions, but not useful for bookmarks, phone home-screens, or automation.

A **Cloudflare Named Tunnel** gives you a stable, permanent URL (e.g. `https://forge.yourdomain.com`) that never changes.

---

## Prerequisites

- A **Cloudflare account** (free tier works)
- A **domain** added to Cloudflare (even a free one works; you can also use a Cloudflare-provided subdomain on `cfargotunnel.com`)
- `cloudflared` installed on the machine running Forge  
  → Download: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

---

## Step 1 — Create a Named Tunnel in Cloudflare Zero Trust

1. Go to [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) → **Networks → Tunnels**
2. Click **Create a tunnel** → choose **Cloudflared** → name it (e.g. `forge-home`)
3. On the next screen, Cloudflare shows you an install command. **Copy the token** — it's the long `eyJ…` string passed after `--token` in the command. You only need the token, not the full command.
4. Click **Next**

## Step 2 — Configure a Public Hostname

Still in the tunnel wizard (or later via **Edit → Public Hostname → Add a public hostname**):

| Field | Value |
|-------|-------|
| **Subdomain** | `forge` (or anything you like) |
| **Domain** | your Cloudflare domain (e.g. `example.com`) |
| **Service → Type** | `HTTP` |
| **Service → URL** | `localhost:3005` *(or whichever port Forge uses — see note below)* |

Click **Save tunnel**.

> **Port note:** Forge defaults to port `3005`. To guarantee a fixed port, start Forge with:
> ```
> forge --port 3005
> # or
> FORGE_PORT=3005 forge
> ```

Your permanent public URL will be: `https://forge.example.com`

## Step 3 — Configure Forge

Open Forge → **Settings** (gear icon) → **Notifications** tab → scroll down to **Persistent Remote Access**.

Fill in:
- **Tunnel Token** — the `eyJ…` token from Step 1
- **Public Hostname** — the full URL, e.g. `https://forge.example.com`

Click **Save Settings**.

## Step 4 — Start Remote Access

Open the **Remote Access** modal (WiFi icon in the toolbar). Click **Start Remote Access**.

Forge will launch `cloudflared tunnel run --token <TOKEN>` in the background. Because the URL is already known from your Cloudflare configuration, it appears immediately — no waiting for URL parsing.

The QR code will show a **"🔗 Persistent URL — safe to bookmark"** badge instead of the ephemeral warning.

---

## Switching Back to Ephemeral Mode

Clear both fields (**Tunnel Token** and **Public Hostname**) in Settings and save. Forge will revert to the ephemeral quick tunnel on the next start.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cloudflared not found` | Install cloudflared and ensure it's in PATH or at `~/.forge/bin/cloudflared` |
| Tunnel connects but page won't load | Verify the Service URL in Cloudflare matches Forge's actual port (`localhost:3005`) |
| Token rejected | Re-copy the token from Zero Trust → Tunnels → your tunnel → Configure |
| URL shows in UI but returns 502 | Forge isn't running, or is on a different port than the Cloudflare ingress rule |
