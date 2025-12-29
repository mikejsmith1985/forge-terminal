# Forge Terminal v3.5.2 Release Notes

**Release Date:** December 29, 2024

## Overview

v3.5.2 is a critical bug-fix release that addresses broken SLM code that prevented building, fixes the tab focus bug, and confirms image vision integration is working correctly.

## Bug Fixes

### 1. SLM Implementation Fix (Critical)
**Problem:** The `embedded.go` file had undefined types (`EmbeddedProvider`), missing imports (`os`, `filepath`), and missing constants, causing build failures.

**Solution:** 
- Rewrote `embedded.go` with clean `RuleBasedProvider` implementation
- Added proper imports and constant definitions
- Updated `engine.go` to use correct provider chain
- Provider priority: **Ollama → LlamaCpp → RuleBased → Heuristic**
- All analysis is FREE and LOCAL

**How to Enable Real AI:**
1. **Ollama (Recommended):** Install from [ollama.ai](https://ollama.ai), run `ollama pull qwen2.5:0.5b`
2. **LlamaCpp:** Download `llama-cli` binary and `qwen2.5-0.5b-q4.gguf` model to `~/.forge/`

### 2. Tab Focus Stealing Fix
**Problem:** When multiple tabs were open and user pressed spacebar, focus jumped to the first tab.

**Root Cause:** xterm creates a `<textarea>` for each terminal. Hidden terminals still had focusable textareas.

**Solution:**
- Added `MutationObserver` to handle dynamically created xterm textareas
- Set `tabIndex=-1` on hidden terminal textareas
- Hidden terminals are now completely removed from keyboard tab order
- Textareas are properly blurred when tab becomes hidden

### 3. Image Vision Analysis (Verified)
**Status:** Already correctly implemented - no changes needed.

The architecture works as follows:
1. User pastes image → saved to temp file
2. `ImageAnalyzer` queues image for background analysis
3. If Ollama+llava available → real AI vision (0.9 confidence)
4. If not → heuristic description (0.5 confidence)
5. Description is injected into next user input

**How to Enable Vision:**
```bash
ollama pull llava
```

## Technical Changes

### New Files
- `internal/slm/llamacpp_provider.go` - LlamaCpp subprocess provider
- `internal/slm/local_providers_test.go` - Local provider test suite
- `frontend/src/test/tabFocus.test.js` - Tab focus test suite (8 tests)

### Modified Files
- `internal/slm/engine.go` - Updated provider priority chain
- `internal/am/image_analyzer.go` - Added Ollama vision integration
- `frontend/src/components/ForgeTerminal.jsx` - Tab focus fix

## Testing

| Test Suite | Status |
|------------|--------|
| SLM Tests | ✅ All Passing |
| Tab Focus Tests | ✅ 8/8 Passing |
| Go Build | ✅ Success |
| Frontend Build | ✅ Success |

## Upgrade Notes

- No breaking changes
- Existing configurations remain valid
- Users can optionally install Ollama for enhanced AI features (free)

## Known Limitations

- Without Ollama or LlamaCpp, the system falls back to rule-based heuristics
- Vision analysis requires a vision-capable model (llava, etc.)
- LlamaCpp subprocess inference is slower than Ollama's server-based approach

## Contributors

Built with TDD methodology following `copilot-instructions.md` guidelines.
