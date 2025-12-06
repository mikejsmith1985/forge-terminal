# GitHub Release → Local Handshake Automation

## The Challenge

**GitHub Actions cannot directly ping your local machine** for security reasons. However, there are several practical solutions to automatically update your local handshake document when a release is published.

---

## ✅ Solution 1: GitHub Release Integration (RECOMMENDED)

The GitHub workflow now **automatically generates and includes** the handshake document in every release.

### How It Works

```yaml
# .github/workflows/release.yml
- Generate handshake in CI
- Validate handshake
- Include FORGE_HANDSHAKE.md in release assets
```

### Usage

**Download handshake from latest release:**
```bash
# Get latest release version
VERSION=$(curl -s https://api.github.com/repos/mikejsmith1985/forge-terminal/releases/latest | grep tag_name | cut -d'"' -f4)

# Download handshake
curl -L "https://github.com/mikejsmith1985/forge-terminal/releases/download/$VERSION/FORGE_HANDSHAKE.md" -o FORGE_HANDSHAKE.md
```

**Benefits:**
- ✅ No local setup required
- ✅ Works from any machine
- ✅ Handshake is version-stamped
- ✅ Accessible via GitHub UI

---

## ✅ Solution 2: Automatic Release Watcher (BACKGROUND POLLING)

Runs a background process that polls GitHub for new releases every 5 minutes.

### Setup

```bash
# Start watcher in background
./scripts/watch-releases.sh &

# Or run in tmux/screen for persistence
tmux new -d -s forge-watcher './scripts/watch-releases.sh'

# Check logs
tail -f .forge/release-watcher.log
```

### How It Works

1. Polls GitHub API every 5 minutes
2. Detects new release versions
3. Downloads handshake from release assets
4. Falls back to local generation if not found
5. Shows desktop notification (if notify-send available)

### Systemd Service (Linux)

For automatic startup on boot:

```bash
# Install service (replace 'mikej' with your username)
sudo cp scripts/forge-release-watcher@.service /etc/systemd/user/
sudo systemctl --user enable forge-release-watcher@mikej
sudo systemctl --user start forge-release-watcher@mikej

# Check status
systemctl --user status forge-release-watcher@mikej

# View logs
journalctl --user -u forge-release-watcher@mikej -f
```

**Benefits:**
- ✅ Fully automatic
- ✅ Runs in background
- ✅ Desktop notifications
- ✅ Survives reboots (with systemd)

**Drawbacks:**
- ⚠️  Polls every 5 minutes (slight delay)
- ⚠️  Uses minimal resources but always running

---

## ✅ Solution 3: Webhook Server (REAL-TIME)

Runs a local HTTP server that GitHub can ping directly (requires public IP or ngrok).

### Setup

```bash
# Start webhook server
PORT=8765 ./scripts/webhook-server.sh &

# Or expose via ngrok for public access
ngrok http 8765
```

### Configure GitHub Webhook

1. Go to: `https://github.com/mikejsmith1985/forge-terminal/settings/hooks`
2. Click "Add webhook"
3. Set Payload URL: `http://YOUR_PUBLIC_IP:8765` (or ngrok URL)
4. Set Content type: `application/json`
5. Select events: ✅ Releases
6. Save webhook

### How It Works

1. GitHub sends POST request on release
2. Local server receives webhook
3. Extracts version from payload
4. Generates handshake immediately
5. Shows desktop notification

**Benefits:**
- ✅ Instant notification (<1 second)
- ✅ Only runs when needed
- ✅ Direct GitHub integration

**Drawbacks:**
- ⚠️  Requires public IP or ngrok
- ⚠️  Port forwarding/firewall config
- ⚠️  Security considerations (webhook secret recommended)

---

## ✅ Solution 4: Manual Check Command

Simple command to check and sync latest release.

### Usage

```bash
# Create quick sync script
cat > sync-handshake.sh << 'EOF'
#!/bin/bash
VERSION=$(curl -s https://api.github.com/repos/mikejsmith1985/forge-terminal/releases/latest | grep tag_name | cut -d'"' -f4)
echo "📦 Latest release: $VERSION"
curl -L "https://github.com/mikejsmith1985/forge-terminal/releases/download/$VERSION/FORGE_HANDSHAKE.md" -o FORGE_HANDSHAKE.md
echo "✅ Handshake synchronized"
EOF

chmod +x sync-handshake.sh

# Run whenever needed
./sync-handshake.sh
```

**Benefits:**
- ✅ Simple and reliable
- ✅ No background processes
- ✅ Full control

**Drawbacks:**
- ⚠️  Manual execution required

---

## ✅ Solution 5: Git Sync (ORCHESTRATOR USE CASE)

For Forge Orchestrator to stay in sync with Terminal releases.

### Orchestrator Repository Setup

Create `.github/workflows/sync-terminal-handshake.yml`:

```yaml
name: Sync Terminal Handshake

on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_dispatch:
  repository_dispatch:
    types: [terminal_release]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Get Latest Terminal Release
        id: latest
        run: |
          VERSION=$(curl -s https://api.github.com/repos/mikejsmith1985/forge-terminal/releases/latest | jq -r .tag_name)
          echo "version=$VERSION" >> $GITHUB_OUTPUT
      
      - name: Download Handshake
        run: |
          curl -L "https://github.com/mikejsmith1985/forge-terminal/releases/download/${{ steps.latest.outputs.version }}/FORGE_HANDSHAKE.md" \
            -o docs/terminal-spec.md
      
      - name: Commit if Changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/terminal-spec.md
          git diff --staged --quiet || \
            (git commit -m "sync: update terminal handshake to ${{ steps.latest.outputs.version }}" && git push)
```

### Terminal to Orchestrator Notification

Add to Terminal's `release.yml` (already included):

```yaml
- name: Notify Orchestrator Repository
  run: |
    curl -X POST \
      -H "Authorization: Bearer ${{ secrets.ORCHESTRATOR_PAT }}" \
      https://api.github.com/repos/OWNER/orchestrator/dispatches \
      -d '{"event_type":"terminal_release","client_payload":{"version":"$VERSION"}}'
```

**Setup:**
1. Create Personal Access Token (PAT) with `repo` scope
2. Add as secret: `ORCHESTRATOR_PAT` in Terminal repo
3. Update OWNER and repo name in workflow

**Benefits:**
- ✅ Automatic sync for Orchestrator
- ✅ Version-tracked in git
- ✅ Can trigger Orchestrator tests
- ✅ Audit trail

---

## 📊 Comparison

| Solution | Speed | Setup | Reliability | Use Case |
|----------|-------|-------|-------------|----------|
| **Release Asset** | Manual | ⭐ Easy | ⭐⭐⭐ High | One-time sync |
| **Release Watcher** | ~5min | ⭐⭐ Medium | ⭐⭐⭐ High | Local dev |
| **Webhook Server** | <1sec | ⭐⭐⭐ Hard | ⭐⭐ Medium | Power users |
| **Manual Sync** | Instant | ⭐ Easy | ⭐⭐⭐ High | Occasional use |
| **Git Sync** | ~4hrs | ⭐⭐ Medium | ⭐⭐⭐ High | Orchestrator |

---

## 🎯 Recommended Setup

### For Terminal Development

1. **Enable pre-commit hook** (auto-generates on version changes)
   ```bash
   cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```

2. **Use release watcher** (optional, for staying synced)
   ```bash
   ./scripts/watch-releases.sh &
   ```

### For Orchestrator Integration

1. **Set up GitHub Actions sync** (see Solution 5)
2. **Enable repository dispatch** from Terminal
3. **Run parity tests** on handshake updates

### For Manual Management

1. **Generate before release**
   ```bash
   make handshake-doc
   ```

2. **Validate before tagging**
   ```bash
   make validate-handshake
   ```

3. **GitHub workflow handles the rest**

---

## 🔧 Troubleshooting

### Release Watcher Not Working

```bash
# Check if running
ps aux | grep watch-releases

# Check logs
tail -f .forge/release-watcher.log

# Test API access
curl -s https://api.github.com/repos/mikejsmith1985/forge-terminal/releases/latest
```

### Webhook Not Receiving Events

```bash
# Check server is running
netstat -tuln | grep 8765

# Test locally
curl -X POST http://localhost:8765 \
  -H "X-GitHub-Event: release" \
  -d '{"tag_name":"v1.0.0"}'

# Check GitHub webhook deliveries
# Go to: Settings → Webhooks → Recent Deliveries
```

### Handshake Not in Release

```bash
# Check workflow ran successfully
gh run list --workflow=release.yml

# Check release assets
gh release view --web

# Manually upload if missing
gh release upload TAG_NAME FORGE_HANDSHAKE.md
```

---

## 🚀 Future Enhancements

- [ ] Browser extension to monitor releases
- [ ] Desktop app with system tray icon
- [ ] Email notifications via GitHub Actions
- [ ] Slack/Discord webhook integration
- [ ] RSS feed for releases
- [ ] GitHub App for authenticated webhooks

---

## 📝 Summary

**Best practice:** GitHub workflow automatically generates and includes handshake in releases. Use **Release Watcher** for local auto-sync or **manual download** when needed. For Orchestrator, use **GitHub Actions scheduled sync**.

No direct "ping back to local" is possible, but these solutions provide practical alternatives that are secure, reliable, and fit different workflows.
