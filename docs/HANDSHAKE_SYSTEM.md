# Forge Handshake System

## Overview

The **Forge Handshake Document** (`FORGE_HANDSHAKE.md`) is a machine-readable specification that defines 100% of Forge Terminal's functionality. It serves as a contract between Forge Terminal (free) and Forge Orchestrator (paid) to ensure **1:1 feature parity**.

## Purpose

- **Feature Inventory**: Complete catalog of all features, APIs, components, and data models
- **Version Tracking**: Auto-generated with version numbers and timestamps
- **Compatibility Contract**: Ensures Orchestrator implements Terminal as a perfect subset
- **Migration Guide**: Helps users understand upgrade path from Terminal to Orchestrator
- **Development Reference**: Single source of truth for both projects

## Document Structure

```
1. Core Architecture - Tech stack and platform details
2. API Endpoints - Auto-detected from main.go (20 endpoints)
3. UI Components - React components list (17 components)
4. Feature Catalog - Complete checklist (18 categories, 100+ features)
5. Data Models - JSON schemas for all data structures
6. Security Considerations - Storage, network, and update security
7. Orchestrator Guidance - Features to scale vs. keep identical
8. Automation Info - How this document is generated
9. Change Tracking - When to update and validation checklist
10. Compatibility Promise - Guarantees and migration path
```

## Automation

### Manual Generation

```bash
# Generate handshake document
make handshake-doc

# Or run script directly
./scripts/generate-handshake.sh
```

### Automatic Generation

#### Option 1: Pre-Commit Hook (Recommended)

```bash
# Enable automatic generation on version changes
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Now whenever you modify `internal/updater/updater.go` or `frontend/package.json`, the handshake document will auto-regenerate.

#### Option 2: CI/CD Pipeline

Add to GitHub Actions workflow:

```yaml
- name: Generate Handshake Document
  run: |
    make handshake-doc
    git diff --exit-code FORGE_HANDSHAKE.md || \
      (echo "❌ Handshake document out of sync! Run 'make handshake-doc'" && exit 1)
```

#### Option 3: Pre-Release Script

```bash
#!/bin/bash
# scripts/prepare-release.sh
VERSION=$1

# Update version
sed -i "s/var Version = .*/var Version = \"$VERSION\"/" internal/updater/updater.go

# Regenerate handshake
make handshake-doc

# Commit changes
git add internal/updater/updater.go FORGE_HANDSHAKE.md
git commit -m "chore: bump version to $VERSION"
git tag "v$VERSION"
```

## What Gets Auto-Detected

### ✅ Automatically Extracted

- Backend version from `internal/updater/updater.go`
- Frontend version from `frontend/package.json`
- API endpoints from `cmd/forge/main.go` (via regex)
- Component count from `frontend/src/components/*.jsx`
- Default command count from `internal/commands/storage.go`
- Current timestamp (ISO 8601)

### ⚠️ Manually Maintained

- Feature checklist (18 categories)
- Data model examples
- Security considerations
- Orchestrator guidance
- Compatibility promises

## Sharing with Forge Orchestrator

### Method 1: Direct File Copy

```bash
# In Orchestrator repo
cp /path/to/forge-terminal/FORGE_HANDSHAKE.md docs/terminal-spec.md
```

### Method 2: Git Submodule

```bash
# In Orchestrator repo
git submodule add https://github.com/mikejsmith1985/forge-terminal.git vendor/forge-terminal
ln -s vendor/forge-terminal/FORGE_HANDSHAKE.md docs/terminal-spec.md
```

### Method 3: Automated Sync (CI/CD)

```yaml
# .github/workflows/sync-handshake.yml
name: Sync Terminal Handshake
on:
  schedule:
    - cron: '0 0 * * *'  # Daily
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Download latest handshake
        run: |
          curl -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
            https://raw.githubusercontent.com/mikejsmith1985/forge-terminal/main/FORGE_HANDSHAKE.md \
            -o docs/terminal-spec.md
      - name: Commit if changed
        run: |
          git diff --exit-code || \
            (git add docs/terminal-spec.md && \
             git commit -m "sync: update terminal handshake spec" && \
             git push)
```

## Validation

### Check if Handshake is Up-to-Date

```bash
# Generate fresh copy
make handshake-doc

# Check for differences
git diff FORGE_HANDSHAKE.md

# If output shows differences, document needs updating
```

### Verify Feature Completeness

```bash
# Count total features in document
grep -c '^\- \[x\]' FORGE_HANDSHAKE.md
# Expected: 100+

# Count API endpoints
grep -c '^- `/' FORGE_HANDSHAKE.md
# Expected: 20

# Count components
grep 'UI Components' FORGE_HANDSHAKE.md
# Should show: (17 React Components)
```

## Versioning Strategy

### Version Format

`forge-terminal-v{VERSION}-{DATE}`

Example: `forge-terminal-v1.9.5-2025-12-06`

### Version Bumping

```bash
# Bump patch version (bug fixes)
./scripts/bump-version.sh patch

# Bump minor version (new features)
./scripts/bump-version.sh minor

# Bump major version (breaking changes)
./scripts/bump-version.sh major
```

## Integration with Orchestrator

### Feature Parity Check

Orchestrator should validate it implements all Terminal features:

```javascript
// In Orchestrator test suite
import terminalHandshake from './terminal-spec.md'

test('All Terminal API endpoints are implemented', () => {
  const terminalEndpoints = extractEndpoints(terminalHandshake)
  const orchestratorEndpoints = getImplementedEndpoints()
  
  terminalEndpoints.forEach(endpoint => {
    expect(orchestratorEndpoints).toContain(endpoint)
  })
})
```

### Feature Flags

Use handshake to enable Terminal compatibility mode:

```javascript
if (config.terminalCompatibilityMode) {
  // Load Terminal feature set from handshake
  const terminalFeatures = loadHandshake()
  // Disable Orchestrator-only features
  disableFeatures(orchestratorFeatures.filter(f => !terminalFeatures.includes(f)))
}
```

## Best Practices

1. **Regenerate on every version bump** - Never release without updating handshake
2. **Review before release** - Manually verify feature list is complete
3. **Keep .gitignore entry** - Don't commit to Terminal repo, but share with Orchestrator
4. **Validate in CI** - Fail builds if handshake is out of sync
5. **Document breaking changes** - Add notes when Terminal features change
6. **Sync frequently** - Orchestrator should pull latest handshake weekly

## Troubleshooting

### Script fails with "sed: unterminated s command"

- Issue: Special characters in API endpoint names
- Fix: Script now uses awk instead of sed for endpoint insertion

### Component count is wrong

- Issue: Files outside `frontend/src/components/` counted
- Fix: Script only counts `*.jsx` files in components directory

### Version doesn't match build

- Issue: Version set via ldflags at build time
- Fix: Script reads from source files, not built binary

## Future Enhancements

- [ ] Add JSON schema output for machine parsing
- [ ] Generate TypeScript interfaces from data models
- [ ] Add API endpoint usage examples
- [ ] Include keyboard shortcut reference table
- [ ] Generate changelog from git history
- [ ] Add visual diff tool for version comparison
- [ ] Create interactive HTML version
- [ ] Add breaking change detection

## Questions?

See `FORGE_HANDSHAKE.md` for the complete specification or run:

```bash
make handshake-doc
cat FORGE_HANDSHAKE.md
```
