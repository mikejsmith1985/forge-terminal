# Release Script Enhancement - Tour Version Auto-Update

## Problem
The tour version (`TOUR_VERSION` in `tourSteps.js`) was not being automatically updated during releases, meaning users wouldn't see the tour again after updates even though the tour has version-detection logic.

## Solution
Enhanced `scripts/release.sh` to automatically update version numbers in key files before committing.

## Files Modified

### `scripts/release.sh`

**Added** (lines 246-272):
```bash
# Update version in files
echo -e "${CYAN}[1/6]${NC} Updating version numbers..."

# Update Go version constant
if [ -f "internal/updater/updater.go" ]; then
    sed -i.bak "s/var Version = \"[^\"]*\"/var Version = \"${NEW_VERSION}\"/" internal/updater/updater.go
    rm -f internal/updater/updater.go.bak
    echo -e "${GREEN}  ✓ Updated internal/updater/updater.go${NC}"
fi

# Update frontend package.json
if [ -f "frontend/package.json" ]; then
    sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" frontend/package.json
    rm -f frontend/package.json.bak
    echo -e "${GREEN}  ✓ Updated frontend/package.json${NC}"
fi

# Update tour version
if [ -f "frontend/src/config/tourSteps.js" ]; then
    sed -i.bak "s/const TOUR_VERSION = '[^']*'/const TOUR_VERSION = '${NEW_VERSION}'/" frontend/src/config/tourSteps.js
    rm -f frontend/src/config/tourSteps.js.bak
    echo -e "${GREEN}  ✓ Updated TOUR_VERSION in tourSteps.js${NC}"
fi
```

**Updated**: Step numbering from `[1/5] ... [5/5]` → `[1/6] ... [6/6]`

## How It Works

### Release Flow (Updated):
1. **[1/6] Update versions** ⭐ NEW
   - Updates `internal/updater/updater.go` Version constant (main app version)
   - Updates `frontend/package.json` version field
   - Updates `TOUR_VERSION` constant in `tourSteps.js`
   - Creates `.bak` files temporarily (deleted immediately)
   
2. **[2/6] Stage changes** (was 1/5)
   - `git add -A` includes the version file changes
   
3. **[3/6] Commit** (was 2/5)
   - Commits with AI-generated message
   
4. **[4/6] Push commit** (was 3/5)
   - Pushes to origin/main
   
5. **[5/6] Create tag** (was 4/5)
   - Creates annotated git tag
   
6. **[6/6] Push tag** (was 5/5)
   - Triggers GitHub Actions build

### Version Detection Flow:
```
User on v3.12.3 → Completes tour → Saves {version: '3.12.3'}
                     ↓
                  Update released
                     ↓
              Release script runs
                     ↓
    Updates tourSteps.js: TOUR_VERSION = '3.12.4'
                     ↓
              User updates app
                     ↓
    App compares: stored '3.12.3' !== current '3.12.4'
                     ↓
              🎯 Tour auto-runs!
```

## Files Updated by Release Script

| File | Line/Pattern | Update | Purpose |
|------|--------------|--------|---------|
| `internal/updater/updater.go` | `var Version = "X.Y.Z"` | Version bumped | Main app version for update checks |
| `frontend/package.json` | `"version": "X.Y.Z"` | Version bumped | Frontend package version |
| `frontend/src/config/tourSteps.js` | `const TOUR_VERSION = 'X.Y.Z'` | Version bumped | Tour version detection |

## Usage

No change to usage - the release script automatically handles version updates:

```bash
# Patch release (default)
./scripts/release.sh

# Minor release
./scripts/release.sh minor

# Major release
./scripts/release.sh major

# Custom version
./scripts/release.sh custom
```

## Benefits

✅ **Automatic tour re-trigger** after updates
✅ **Consistent versioning** across files
✅ **No manual editing** required
✅ **Backup files** (.bak) are auto-cleaned
✅ **Safe sed operations** with file existence checks

## Testing

To test the version update logic without pushing:

```bash
# Check current versions
grep '"version"' frontend/package.json
grep 'TOUR_VERSION' frontend/src/config/tourSteps.js

# Run release script (stop before git push)
# The version updates happen in step [1/6]
```

## Edge Cases Handled

- **Missing files**: `if [ -f "..." ]` checks prevent errors
- **Backup cleanup**: `.bak` files removed immediately
- **sed portability**: Works on Linux/macOS (Git Bash on Windows)
- **Regex safety**: Quotes and escaping prevent injection

## Future Enhancements (Optional)

If more version files need updates, add similar blocks:

```bash
# Update Go version constant (if added)
if [ -f "cmd/forge/main.go" ]; then
    sed -i.bak "s/const Version = \"[^\"]*\"/const Version = \"${NEW_VERSION}\"/" cmd/forge/main.go
    rm -f cmd/forge/main.go.bak
    echo -e "${GREEN}  ✓ Updated cmd/forge/main.go${NC}"
fi
```

## Verification

After running the release script, check:
```bash
git show HEAD:frontend/package.json | grep version
git show HEAD:frontend/src/config/tourSteps.js | grep TOUR_VERSION
```

Should show the new version in both files.
