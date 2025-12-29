# Forge Terminal v3.5.2 Release Notes

**Release Date:** December 29, 2024

## Overview

v3.5.2 focuses on delivering a fully functional local SLM (Small Language Model) system with zero external API costs, fixing critical UX bugs, and enabling real AI vision capabilities through Ollama integration.

## Bug Fixes

### 1. SLM Implementation (Issue #1)
**Problem:** The SLM system was stubbed out, using only heuristics instead of real AI analysis.

**Solution:** 
- Implemented `LlamaCppProvider` for subprocess-based GGUF model inference
- Updated engine priority: **Ollama → LlamaCpp → Embedded → Heuristic**
- Removed Claude CLI provider (violated the no-external-API-cost requirement)
- All analysis is now FREE and LOCAL

**How to Enable Real AI:**
1. **Ollama (Recommended):** Install from [ollama.ai](https://ollama.ai), run `ollama pull qwen2.5:0.5b`
2. **LlamaCpp:** Download `llama-cli` binary and `qwen2.5-0.5b-q4.gguf` model to `~/.forge/`

### 2. Tab Focus Stealing (Issue #2)
**Problem:** When a second tab was opened and user pressed spacebar, focus jumped to the first tab's terminal.

**Root Cause:** xterm creates a `<textarea>` for each terminal. Hidden terminals still had focusable textareas (tabIndex=0).

**Solution:**
- Set `tabIndex=-1` on hidden terminal textareas
- Added `useEffect` hook in `ForgeTerminal.jsx` to manage focus state
- Hidden terminals are now completely removed from keyboard tab order

### 3. Image Vision Analysis (Issue #3)
**Problem:** Pasted images couldn't be analyzed by AI - only basic heuristics were used.

**Solution:**
- Integrated Ollama vision API for real image analysis (supports `llava`, `bakllava`, `moondream` models)
- Enhanced heuristic descriptions when no vision model is available
- Clear user guidance: "Install Ollama with llava for detailed analysis"

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
