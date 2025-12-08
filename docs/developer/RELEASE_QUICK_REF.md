# Quick Reference: Release Automation

## For Developers

### Before Release
```bash
# Tag release (version is auto-injected at build time)
git tag v1.X.X
git push && git push --tags
```

**Note:** Version is automatically injected from git tags at build time via ldflags.
No manual version file updates needed!

### After Release
GitHub workflow automatically:
- ✅ Builds binaries (Linux, macOS, Windows)
- ✅ Signs macOS binaries
- ✅ Creates GitHub release with binaries

## File Locations

- **Release binaries**: `bin/forge-*`
- **Workflow**: `.github/workflows/release.yml`
- **Build commands**: `Makefile`

## Troubleshooting

**macOS build failed?**
Check `.github/workflows/release.yml` for any sed or build errors.

**Release assets missing?**
Verify the workflow completed successfully on GitHub Actions.

## See Also

- Full documentation: `docs/developer/`
- GitHub workflow: `.github/workflows/release.yml`

