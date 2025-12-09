# GitHub Release Process

## Overview

Forge Terminal uses GitHub Actions to automatically build and release binaries for Linux, macOS, and Windows.

## Release Workflow

### Manual Trigger

1. Create and push a git tag:
```bash
git tag v1.X.X
git push origin v1.X.X
```

2. GitHub Actions automatically:
   - Builds binaries for all platforms (Linux, macOS, Windows)
   - Signs macOS binaries with ad-hoc signing
   - Creates a GitHub release with binaries
   - Publishes to GitHub releases

### Automatic Workflow

The release workflow is triggered whenever a tag matching `v*` is pushed.

See `.github/workflows/release.yml` for the full workflow definition.

## macOS Build Issues

If macOS builds are failing:
1. Check the GitHub Actions logs for the specific error
2. Verify the build step on the macOS runner
3. Most common issues are environment/tool related, not code related

## Release Assets

Each release includes:
- `forge-linux-amd64` - Linux AMD64 binary
- `forge-windows-amd64.exe` - Windows AMD64 binary  
- `forge-darwin-amd64` - macOS Intel binary
- `forge-darwin-arm64` - macOS Apple Silicon binary

## Version Management

Version is automatically injected from git tags at build time via ldflags:
```
-X github.com/mikejsmith1985/forge-terminal/internal/updater.Version=${VERSION}
```

No manual version file updates needed.

## See Also

- Release workflow: `.github/workflows/release.yml`
- Build targets: `Makefile`
- Development guide: `docs/developer/`
