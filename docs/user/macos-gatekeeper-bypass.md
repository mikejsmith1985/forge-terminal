# Fixing "Cannot verify developer" Error on macOS

If you're seeing this error when running Forge Terminal:

> **"forge-darwin-arm64" cannot be opened because the developer cannot be verified.**

This is a macOS security feature, not a problem with Forge Terminal. Don't worry—it's easy to fix!

## Quick Fix (2 seconds)

### Method 1: Right-Click to Open

1. **Right-click** the downloaded binary
2. Select **Open** from the context menu
3. Click **Open** again in the security dialog

Done! macOS will remember your choice and won't warn you again.

### Method 2: Terminal (One Command)

```bash
xattr -d com.apple.quarantine ./forge-darwin-arm64 && ./forge-darwin-arm64
```

Replace `forge-darwin-arm64` with `forge-darwin-amd64` if you're on Intel.

## Why Does This Happen?

Apple requires apps to be code-signed and notarized for distribution. Forge Terminal is an ad-hoc signed development build, so macOS shows a security warning on first run—but it's perfectly safe.

## Which Binary Do I Need?

- **Apple Silicon** (M1, M2, M3): `forge-darwin-arm64`
- **Intel Mac**: `forge-darwin-amd64`

## Want Notarized Builds?

If you want to distribute fully notarized binaries without this warning, you can:
- Fork the Forge Terminal repository
- Set up your own Apple Developer ID certificate
- Enable automatic code signing in the GitHub Actions workflow

See [Fork & Self-Sign Guide](../developer/macos-fork-setup.md) for details.

## Still Having Issues?

1. Make sure binary is executable: `chmod +x forge-darwin-arm64`
2. Try both methods above
3. Check you're on macOS 10.13 or later

Still stuck? [Open an issue on GitHub](https://github.com/mikejsmith1985/forge-terminal/issues).
