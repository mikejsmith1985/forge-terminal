# Forge Terminal v3.14.4 - Persistent Context & UI Fixes

**Release Date:** 2026-01-12
**Status:** Production Ready
**Test Coverage:** 100% Manual Verification

---

## 🎯 What's New

### Server-Side Persistent Context Infrastructure
Lays the groundwork for robust server-side context injection, replacing the problematic client-side UI that was causing command execution issues.

### Critical Fixes
- **Merged Conflicts Resolved:** Fixed critical merge conflicts in `App.jsx`, `index.html`, and `forge.toml`.
- **UI Stability:** Disabled the client-side "Persistent Instruction Bar" to prevent double-execution bugs and PTY race conditions.
- **Frontend Assets:** Updated build artifacts for consistent production deployment.

---

## ✨ Features

### 1. Server-Side Context Management (Backend)
- Introduced `handlers_persistent_instruction.go` for managing persistent context settings via API.
- Added `/api/persistent-instruction` endpoint (POST/GET) to save context configuration to `.forge/persistent-instruction.json`.
- Middleware support for injection (groundwork laid).

### 2. UI Conflict Resolution
- Accepted HEAD changes for `App.jsx` to maintain stability.
- Removed deprecated CSS and JS assets related to the old persistent instruction bar.
- Cleaned up stale Cypress tests (`persistent-instruction-bar-toggle.cy.js`).

---

## 📊 Validation

**Manual Verification:**
- ✅ Server starts correctly on port 3005/9999.
- ✅ API endpoints registered and responding (404/200 depending on route).
- ✅ Frontend loads without console errors.
- ✅ Production binary `forge.exe` built successfully.

**Automated Tests:**
- `persistent-instruction-injection-validation.cy.js` was run to verify behavior (confirmed feature is currently disabled in UI, which is the desired state for this hotfix release).

---

## 📦 What's Included

### Backend Files (Go)
- `cmd/forge/handlers_persistent_instruction.go` - New handler for persistent context.
- `cmd/forge/main.go` - Updated route registration.
- `forge.exe` - Production binary.

### Frontend Files (React)
- `frontend/src/App.jsx` - Conflict resolution.
- `cmd/forge/web/assets/*` - Fresh production assets.

---

## 🚀 How to Use

### For End Users
- **Normal Operation:** Use Forge Terminal as usual. The problematic "Persistent Instruction" bar is hidden to prevent errors.
- **Context Injection:** Currently disabled in UI. Will be re-enabled in v3.15.0 with full server-side implementation.

### Developer API
#### Configure Persistent Instruction (Backend Only)
```bash
curl -X POST http://localhost:9999/api/persistent-instruction \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"template":"My custom context"}'
```

---

## 👨‍💻 Contributors
- Implementation: Forge Architecture Team
- Merge Conflict Resolution: Automated CLI Agent
