# Release Summary v2.1.3

## 🚀 Release v2.1.3

### 🐛 Bug Fixes
- **Auto-Respond**: Fixed a starvation bug where prompt detection was indefinitely cancelled during continuous output (spinners/progress bars).
- **Release Manager Card**: Fixed "Release Type" label incorrectly defaulting to "BUG FIXES" due to version string mismatch.
- **Image Paste**: Fixed image pasting by replacing fragile `Ctrl+V` interception with a robust native `paste` event listener, bypassing browser security restrictions on `navigator.clipboard.read()`.
- **Assistant Panel Settings**: Fixed `ReferenceError: MessageSquare is not defined` that prevented the settings panel from opening.
- **Error Logging**: Added missing `/api/log-error` endpoint to backend and improved frontend `ErrorBoundary` to correctly log client-side errors.

### ✨ Improvements
- **Model Testing & Training**: Implemented real-time progress visualization for model testing and training in the Assistant Panel.
- **UI/UX**: Added visual feedback (spinners, success/error states) for long-running assistant tasks.

### 📦 Build & Deployment
- **Windows Compatibility**: Updated build scripts and command generation for better Windows support.
- **CI/CD**: Release workflow now delegates build process to GitHub Actions by default.
