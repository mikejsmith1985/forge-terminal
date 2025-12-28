# Release v3.3.11 - Critical Fix: useMemo Import

**Release Date:** 2025-12-28

## 🐛 Critical Bug Fix

### Fixed Missing React Hook Import
- **Issue:** `ReferenceError: useMemo is not defined` in production build
- **Root Cause:** Missing `useMemo` import in `App.jsx` line 1
- **Impact:** Application crashed on load after v3.3.10 upgrade
- **Resolution:** Added `useMemo` to React imports in `App.jsx`

## 📦 Changes

### Frontend
- Fixed React hook import in `App.jsx` (added `useMemo` to imports)
- Rebuilt production bundle with correct dependencies
- New bundle hash: `index.CsxREbLB.js` (was `index.3qHA1mRa.js`)

### Version Bump
- Updated version from 3.3.10 → 3.3.11
- Updated `internal/updater/updater.go`
- Updated `frontend/package.json`

## 🔍 Technical Details

The error occurred because:
1. `useMemo` hook was used on line 156 of `App.jsx` (for `tourActionHandlers`)
2. Import statement on line 1 was missing `useMemo`
3. Build succeeded but runtime failed in minified code

## ✅ Verification

Build output:
```
✓ 1937 modules transformed.
../cmd/forge/web/assets/index.CsxREbLB.js   1,262.46 kB │ gzip: 348.80 kB
✓ built in 3.25s
```

## 🚀 Upgrade Instructions

1. Download `forge.exe` from this release
2. Replace your existing binary
3. Restart Forge Terminal
4. Application will auto-refresh to load new assets

## 📝 Notes

- No configuration changes required
- No breaking changes
- Hot-fix release to restore functionality after v3.3.10
