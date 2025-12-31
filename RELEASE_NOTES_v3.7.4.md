# Forge Terminal v3.7.4 - Asset Loading Hotfix

**Release Date:** December 31, 2025

## Overview
Critical hotfix for v3.7.2 asset loading failure caused by stale `index.html` referencing non-existent JavaScript bundles.

## Bug Fix

### 🔧 Asset Reference Mismatch
- **Issue**: v3.7.2 failed to load with `ReferenceError: Cannot access 'Qe' before initialization`
- **Root Cause**: Build directory contained stale `index.html` referencing old asset hashes (`index-aV9iDZP2.js`) while actual built assets had different hashes (`index.K-p_Aqwr.js`)
- **Fix**: Ensured clean build process removes stale files before Vite generates new assets

### 🛠️ Build Process Enhancement
- Vite config already had `emptyOutDir: true` - working as intended
- Issue was specific to v3.7.2 release build having stale files
- This hotfix ensures proper asset hash synchronization between `index.html` and JavaScript bundles

## Technical Details

**Error Symptoms:**
```
ReferenceError: Cannot access 'Qe' before initialization
    at jK (index.K-p_Aqwr.js:999:2546)
```

**Root Issue:**
- HTML referenced: `/assets/index-aV9iDZP2.js`
- Actual file: `/assets/index.K-p_Aqwr.js`
- Browser loaded wrong file → initialization failure

**Resolution:**
- Clean build directory before frontend build
- Verify `index.html` and asset hashes match post-build
- All asset references now consistent

## Files Modified
- `frontend/package.json` - Version bump to 3.7.4
- Build artifacts cleaned and regenerated

## Quality Assurance
- ✅ Frontend builds successfully with no errors
- ✅ Asset hashes in `index.html` match generated bundles
- ✅ Application loads without initialization errors
- ✅ All functionality from v3.7.3 preserved

## User Impact
- ✅ Fixes inability to load Forge Terminal v3.7.2
- ✅ All features from v3.7.2 and v3.7.3 now functional
- ✅ No breaking changes or new features

## Upgrade Path
Users experiencing the v3.7.2 loading error should:
1. Download v3.7.4 binaries from GitHub releases
2. Replace existing binary
3. Restart Forge Terminal

---

**Previous Version:** v3.7.3
**Status:** Production Ready - Critical Hotfix
