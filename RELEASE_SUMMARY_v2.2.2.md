# Release Summary: v2.2.2

**Release Date:** 2025-12-24  
**Type:** Bug Fix  
**Priority:** Critical

## Critical Fix: Auto-Respond System Restored

### Problem
Auto-respond stopped working in v2.2.0/v2.2.1 despite working correctly in v2.0.1. Analysis revealed we had "upgraded" the buffer system in ways that broke Copilot CLI detection.

### Root Cause Analysis
Through systematic testing against working v2.0.1:
1. **Buffer size too large**: Changed from 800 chars (v2.0.1) to 10,000 chars
2. **Wrong buffer strategy**: Switched from `outputBufferRef` to `lastOutputRef`
3. **Copilot CLI behavior**: Modern Copilot (v0.0.369) constantly redraws TUI with spinner animations
4. **Result**: Large buffer fills with spinner frames (`◉ Thinking...`), pushing out actual prompts before detection runs

### Solution
**Reverted to v2.0.1's exact working implementation:**
- ✅ `outputBufferRef` with **800 character sliding window**
- ✅ `requestIdleCallback` for non-blocking detection
- ✅ Detects prompts within small buffer window before spinner animations overwrite them

### Changes Made
**File:** `frontend/src/components/ForgeTerminal.jsx`
- Restored `outputBufferRef.current.data` with 800 char buffer
- Restored `scheduleIdleWork()` / `cancelIdleWork()` using requestIdleCallback
- Detection runs on compact 800-char buffer that stays focused on recent output
- Removed failed 10,000 char buffer and immediate detection experiments

### Testing
- ✅ Verified v2.0.1 works with current Copilot CLI v0.0.369
- ✅ Identified exact working implementation
- ✅ Applied v2.0.1 logic to current codebase
- 🔄 Requires user validation on v2.2.2 release

### Technical Details
**Why 800 chars works:**
- Copilot prompt: `"? Do you want to run this command?\n  ❯ Yes\n  No"` ≈ 60 chars
- With ANSI codes and box drawing: ≈ 300-500 chars
- 800 char buffer: Holds prompt + some spinner frames
- requestIdleCallback fires when browser is idle (10-100ms after last update)
- Small window means prompt is still visible when detection runs

**Why 10,000 chars failed:**
- Buffer fills with dozens of `"◉ Thinking..."` animation frames
- Original prompt text gets pushed out by constant redraws
- Detection sees only the footer: `"...Cancel with Esc"`

### Alternative Discovery
During investigation, discovered Copilot CLI now has:
```
--allow-all-tools    Skip all confirmation prompts
```
Users can add this flag to command cards as alternative to auto-respond feature. However, auto-respond provides more granular per-tab control.

### Files Changed
- `frontend/src/components/ForgeTerminal.jsx` - Restored v2.0.1 buffer logic

### Migration Notes
No breaking changes. Auto-respond toggle behavior unchanged for users.

### Known Issues
None - this restores proven v2.0.1 functionality.

---

**Recommendation:** Test thoroughly with `copilot` (without `--allow-all-tools`) to confirm auto-respond works as it did in v2.0.1.
