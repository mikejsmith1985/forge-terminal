# Release v1.24.7 - Terminal Freeze Fixes & Instrumentation

**Release Date:** 2025-12-18
**Type:** Patch Release (Performance Fix)
**Priority:** P0 - Critical Performance Fix

---

## 🎯 Overview

This release addresses the critical terminal freeze issue experienced during high-speed typing or high-volume output. It implements architectural changes to reduce main thread contention by batching Assistant Memory (AM) processing and adds instrumentation to identify further bottlenecks.

---

## ✨ What's Fixed

### 1. Batch Keystroke AM Processing
- **Problem:** The AM system was checking for active conversations on *every single keystroke*, causing significant CPU overhead on the main thread during rapid typing.
- **Fix:** Implemented a 100ms batching interval for AM checks. Input is accumulated and processed in chunks, significantly reducing the frequency of lock acquisition and string processing.
- **Technical:** Modified `internal/terminal/handler.go` to use `amInputAccumulator` and `time.Since(lastAMCheck)`.

### 2. True AM Disable Flag
- **Problem:** Even when AM was disabled in the UI, the backend still initialized the logger and performed checks on every keystroke (returning early, but still consuming cycles).
- **Fix:** Updated `GetLLMLogger` to return `nil` immediately if the system is disabled, allowing the hot path in the terminal handler to short-circuit completely.
- **Technical:** Modified `internal/am/system.go`.

### 3. Frontend Instrumentation
- **Problem:** Lack of visibility into what exactly was blocking the main thread in the frontend.
- **Fix:** Added performance timing to the WebSocket message handler. Warnings are now logged to the console if message processing takes longer than 16ms (one frame).
- **Technical:** Modified `frontend/src/components/ForgeTerminal.jsx`.

---

## 🔍 Verification

- **Performance:** Typing responsiveness should be improved, especially when AM is enabled.
- **Diagnostics:** If freezes persist, check the browser console for "[Forge] Slow message processing" warnings to pinpoint the cause.
- **Functionality:** AM features (auto-response, command detection) should continue to work as expected, with a maximum latency of 100ms (imperceptible to users).

---

## 📦 Files Changed

- `internal/terminal/handler.go`
- `internal/am/system.go`
- `frontend/src/components/ForgeTerminal.jsx`
- `Freeze-Fix-Data.md` (Analysis update)
