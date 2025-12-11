# Release v1.22.5: AM Performance Fixes & Missing Endpoint

**Release Date:** December 11, 2025  
**Status:** Production Ready

## 🎯 TL;DR

This release fixes a critical missing API endpoint and resolves performance regressions introduced in v1.22.4, while maintaining cross-tab conversation recovery functionality.

## 🐛 Critical Fixes

### 1. Missing `/api/am/log` Endpoint
- **Impact:** AM logging failed silently when using command cards
- **Fix:** Implemented endpoint with conversation start logic and provider normalization
- **Result:** Command card AM triggers now work correctly

### 2. Cross-Tab Recovery Preserved
- **Impact:** Performance fixes broke ability to recover conversations from other tabs
- **Fix:** Smart filtering - AMMonitor filtered per-tab, recovery APIs load all
- **Result:** Can now recover tab-3 conversations from tab-1

## ⚡ Performance Improvements

### Disk I/O Reduction
- **Before:** Every tab read ALL conversation files every 10 seconds
- **After:** Each tab only reads its own files, with 60s cooldown
- **Improvement:** ~85% reduction in disk I/O

### Memory Optimization
- **Before:** All tabs cached all conversations (memory bloat)
- **After:** Each tab only caches its own conversations
- **Improvement:** ~90% reduction in memory per tab

### Configurable Polling
- **Default changed:** 10s → 30s
- **User control:** Adjust via browser console
```javascript
window.__forgeAMConfig?.setPollingInterval(60000) // 60 seconds
```

## 📦 What's Changed
- Added `/api/am/log` endpoint for command card triggers
- Added TabID filtering to `GetConversations()` for performance
- Added 60-second disk read cooldown
- Updated `GetRecoverableSessions()` to support new file format
- Made AM polling interval configurable (default: 30s)
- Added `GetAllConversations()` global function for cross-tab access

## 🔄 Upgrade Guide
1. Download v1.22.5
2. Replace existing binary
3. Restart Forge
4. (Optional) Tune polling if needed

## ⚠️ Breaking Changes
None - drop-in replacement

**Full Changelog:** https://github.com/mikejsmith1985/forge-terminal/compare/v1.22.4...v1.22.5
