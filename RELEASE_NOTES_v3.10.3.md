# Release Notes v3.10.3

## UI Bug Fixes Release

**Release Date**: January 2, 2026

This release fixes three critical UI bugs affecting user experience with Quick Instructions, Feedback submission, and clipboard operations.

### 🔧 Critical Fixes

#### 1. Quick Instructions Modal - Stay Open on Input Click
**Problem:** Quick Instructions modal would close immediately when clicking to type instructions.
**Solution:** Use React `createPortal` to render modal outside ForgeAssist DOM tree, preventing click bubbling.

#### 2. GitHub Feedback PAT Validation  
**Problem:** Feedback submission failed with "PAT is invalid" even with correct tokens.
**Solution:** Support fine-grained PATs with `Bearer` auth format and `X-GitHub-Api-Version` header.

#### 3. Ctrl+V Paste for Images and Videos
**Problem:** Pasting images/videos with Ctrl+V wasn't working - attempted text paste instead.
**Solution:** Prioritize media types over text when reading clipboard.

#### 4. Auto-Respond Model Selection Exclusion
**Problem:** Auto-respond interrupted `/model` command selection menus.
**Solution:** Added exclusion patterns for menus with 3+ options, backend and frontend.

### Changes

#### Frontend
- `frontend/src/components/ForgeAssist.jsx` - React Portal for Quick Instructions and Instruction Manager modals
- `frontend/src/components/FeedbackModal.jsx` - GitHub auth header detection for fine-grained PATs
- `frontend/src/components/ForgeTerminal.jsx` - Reordered clipboard reading to prioritize media types

#### Backend  
- `internal/terminal/sequence_engine.go` - Added ExclusionPatterns for auto-respond
- `internal/terminal/sequence_engine_test.go` - Unit tests for exclusion patterns

#### Tests
- `frontend/e2e/auto-respond-model-selection.spec.js` - Model selection exclusion tests (5 tests)
- `frontend/e2e/ui-bug-fixes.spec.js` - Quick Instructions modal tests

### Testing

All E2E and unit tests passing:
- ✅ Quick Instructions modal stays open on input click
- ✅ Auto-respond excludes model selection menus
- ✅ Auto-respond excludes generic selection menus
- ✅ GitHub fine-grained PAT authentication works
- ✅ Clipboard paste supports images and videos

### Previous v3.10.x Fixes Included

All fixes from v3.10.0, v3.10.1, and v3.10.2 are included:

1. **WebSocket Stability** - PTY watchdog timer for long operations
2. **Auto-respond exclusion** - Prevents firing on /model selection menus  
3. **Paste fallback** - Enhanced clipboard permission handling
4. **AM Monitor updates** - Real-time activity via EventBus
5. **Dev workflow improvements** - Isolated dev port (9999)

### Upgrade Notes

This is a stability and UX-focused release. No breaking changes. All existing features remain compatible.

### Files Modified

- `frontend/src/components/ForgeAssist.jsx` - Modal portal rendering
- `frontend/src/components/FeedbackModal.jsx` - PAT authentication
- `frontend/src/components/ForgeTerminal.jsx` - Clipboard handling
- `internal/terminal/sequence_engine.go` - Auto-respond exclusions
- `internal/terminal/sequence_engine_test.go` - Unit tests
- `frontend/e2e/auto-respond-model-selection.spec.js` - E2E tests  
- `frontend/e2e/ui-bug-fixes.spec.js` - E2E tests
