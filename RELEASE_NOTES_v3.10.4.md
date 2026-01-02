# Release Notes v3.10.4

## Features Tab Removal

**Release Date**: January 2, 2026

This release removes the Features tab from the Lens File Picker. The intelligent AI-powered feature detection functionality has been simplified for better maintainability and clearer codebase.

### 🎯 What Changed

The Lens File Picker now focuses on **3 core viewing modes** instead of 4:

| View | Purpose | Status |
|------|---------|--------|
| 🔥 **Heatmap** | Recent file activity | ✅ Retained |
| 📊 **Graph** | File dependencies | ✅ Retained |
| 🔎 **Search** | Fuzzy file search | ✅ Retained |
| ✗ **Features** | AI-powered feature detection | ❌ Removed |

### 📊 Code Changes

**Files Deleted:**
- `internal/files/feature_analyzer.go` (463 lines) - Backend AI feature detection
- `frontend/e2e/feature-mapping.spec.js` (141 lines) - E2E tests for feature detection
- `cmd/forge/web/assets/index.D8rxsaej.css` (old bundle)
- `cmd/forge/web/assets/index.B8t7_bU6.js` (old bundle)

**Files Modified:**
- `frontend/src/components/LensFilePicker.jsx` (-323 lines) - Removed FeaturesLens component
- `frontend/src/components/LensFilePicker.css` (-128 lines) - Removed feature-related styles
- `cmd/forge/main.go` (removed feature analyzer service registration)
- `frontend/src/config/tourSteps.js` (updated onboarding tour)

**Total Impact:**
```
-1237 lines deleted
+183 lines added
Net: -1054 lines of code
```

### ✅ Validation

All changes have been thoroughly validated:

```
✅ No references to FeaturesLens in codebase
✅ No references to detectFeature in codebase  
✅ No references to feature_analyzer in codebase
✅ Frontend rebuilt successfully
✅ Bundle is clean and optimized
✅ All remaining lens types (heatmap, graph, search) functioning correctly
```

### 🔄 Migration

If you were using the Features tab:

1. **For recent files** → Use the **Heatmap** view (shows most recently modified files)
2. **For related files** → Use the **Graph** view (shows file dependencies and relationships)
3. **For specific files** → Use the **Search** view (fuzzy find by name)

### 🐛 No Breaking API Changes

- The Lens File Picker API is unchanged
- Token counting still works correctly
- Context Cart functionality unchanged
- All three remaining lens types fully operational

---

**Forge Terminal v3.10.4** is a cleaner, leaner release focused on core file-picking functionality.

For questions or issues, visit [GitHub Issues](https://github.com/mikejsmith1985/forge-terminal/issues)
