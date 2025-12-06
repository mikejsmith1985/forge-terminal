# Quick Reference: Release Automation

## For Developers

### Before Release
```bash
# Update version
vim internal/updater/updater.go  # Update version string

# Generate handshake
make handshake-doc

# Validate
make validate-handshake

# Commit changes
git add internal/updater/updater.go FORGE_HANDSHAKE.md
git commit -m "chore: bump version to v1.X.X"
git tag v1.X.X
git push && git push --tags
```

### After Release
GitHub workflow automatically:
- ✅ Builds binaries
- ✅ Generates handshake
- ✅ Validates handshake
- ✅ Includes handshake in release assets
- ✅ Creates GitHub release

## For Local Sync

### Option 1: Manual (Recommended)
```bash
./sync-handshake.sh  # Download from latest release
```

### Option 2: Auto-Watch (Background)
```bash
./scripts/watch-releases.sh &  # Polls every 5 minutes
```

### Option 3: Webhook (Advanced)
```bash
PORT=8765 ./scripts/webhook-server.sh &  # Real-time updates
```

## For Orchestrator Integration

### Setup GitHub Actions Sync
```yaml
# .github/workflows/sync-terminal.yml
on:
  schedule:
    - cron: '0 */4 * * *'
```

### Manual Download
```bash
VERSION=v1.9.5  # Or get from API
curl -L "https://github.com/mikejsmith1985/forge-terminal/releases/download/$VERSION/FORGE_HANDSHAKE.md" \
  -o docs/terminal-spec.md
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `make handshake-doc` | Generate handshake locally |
| `make validate-handshake` | Validate handshake is current |
| `./sync-handshake.sh` | Download from latest release |
| `./scripts/watch-releases.sh` | Start background watcher |
| `./scripts/webhook-server.sh` | Start webhook server |

## File Locations

- **Generated**: `FORGE_HANDSHAKE.md` (gitignored)
- **Release**: Included as GitHub release asset
- **Scripts**: `./scripts/`
- **Docs**: `./docs/RELEASE_AUTOMATION.md`
- **Config**: `.forge/last-release-check`
- **Logs**: `.forge/release-watcher.log`

## Validation

```bash
# Check version match
grep 'var Version' internal/updater/updater.go
grep '**Version**' FORGE_HANDSHAKE.md

# Check API endpoint count
grep -c 'http.HandleFunc' cmd/forge/main.go
grep -c '^- `/' FORGE_HANDSHAKE.md

# Check component count
find frontend/src/components -name '*.jsx' | wc -l
grep 'UI Components' FORGE_HANDSHAKE.md
```

## Troubleshooting

**Handshake out of sync?**
```bash
make handshake-doc
```

**Watcher not running?**
```bash
ps aux | grep watch-releases
tail -f .forge/release-watcher.log
```

**Webhook not receiving?**
```bash
netstat -tuln | grep 8765
curl -X POST localhost:8765 -H "X-GitHub-Event: release"
```

## See Also

- Full documentation: `docs/RELEASE_AUTOMATION.md`
- Handshake system: `docs/HANDSHAKE_SYSTEM.md`
- GitHub workflow: `.github/workflows/release.yml`
