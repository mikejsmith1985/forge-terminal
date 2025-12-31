# Forge Terminal v3.7.5 - Hotfix Release

## 🚨 Critical Fixes

### 🐛 Frontend Initialization Fix
- Fixed a critical `ReferenceError: Cannot access 'Qe' before initialization` that prevented the application from launching.
- Resolved circular dependencies and invalid imports in `ForgeTerminal.jsx` related to `AssistantPanel` and `VisionOverlay`.

## 📦 Components Updated
- `frontend/src/components/ForgeTerminal.jsx` - Removed invalid imports.
- `frontend/package.json` - Version bump to 3.7.5.

## 🛠️ Technical Details
- The issue was caused by imports of components (`AssistantPanel`, `VisionOverlay`) that were previously removed or refactored but not cleaned up in the consumer file.
- This caused the Vite bundler to generate invalid code order, leading to runtime initialization errors.

## 🚀 Installation
1. Download v3.7.5 binaries from GitHub releases
2. Replace your existing `forge` executable
3. Restart Forge Terminal
