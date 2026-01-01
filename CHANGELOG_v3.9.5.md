# Forge Terminal Changelog

## [v3.9.5] - 2026-01-01

### 🔧 WebSocket Stability Fixes
- **Fixed:** WebSocket crashes due to write deadline timeouts
- **Fixed:** Unhandled WriteJSON errors causing connection corruption
- **Fixed:** Race conditions on concurrent WebSocket close
- **Added:** Atomic closed flag to prevent write-after-close panics
- **Improved:** Increased write deadline from 10s to 30s for slow clients
- **Improved:** All WriteJSON calls now check errors and log failures

### 📊 Enhanced AM Monitoring
- **Added:** DetailedReason field showing specific error messages
- **Added:** RedundancySystemStatus showing all 4 capture layers
- **Added:** Native session recovery status (Copilot/Claude)
- **Added:** Native session count in status response
- **Improved:** Frontend tooltip now shows full system diagnostics
- **Improved:** Status messages are now specific and actionable

### 🛡️ Redundancy Systems
Now monitoring and reporting status for:
1. Primary Layer (LLM Logger) - Real-time capture
2. Native Recovery (Copilot/Claude sessions) - Session file monitoring
3. Periodic Capture (PTY snapshots) - Screen capture
4. Health Monitor - System diagnostics

### 📝 Documentation
- Added comprehensive release notes (RELEASE_NOTES_v3.9.5.md)
- Documented all redundancy systems
- Added troubleshooting guide for AM status

---

## [v3.9.4] - 2025-12-XX
Previous release notes...

---

## Release Links
- [v3.9.5 Release](https://github.com/mikejsmith1985/forge-terminal/releases/tag/v3.9.5)
- [Full Changelog](https://github.com/mikejsmith1985/forge-terminal/compare/v3.9.4...v3.9.5)
