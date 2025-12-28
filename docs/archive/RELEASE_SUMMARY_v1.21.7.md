# Forge Terminal v1.21.7 - Production Logging Release

**Release Date:** 2025-12-10  
**Status:** Ready for Testing

## What's Fixed

### Critical: File-Based Production Logging
- **Problem:** Production forge runs have no visible logs, making diagnosis impossible
- **Solution:** All logs now written to `~/.forge/forge.log`
- **Impact:** Can now debug AM system behavior in production

### AM Diagnostics
Added targeted logging for:
- LLM detector command recognition
- LLM logger initialization per tab
- StartConversation calls and results
- Active conversation ID tracking
- Provider inference

## How to Test

1. **Stop current forge instance**
2. **Replace binary:** `cp forge-v1.21.7 <path-to-your-forge>`
3. **Delete old log:** `rm ~/.forge/forge.log` (optional)
4. **Start forge:** Run the new binary
5. **Use copilot:** Execute the copilot command card
6. **Check logs:** `tail -f ~/.forge/forge.log`

## What to Look For

When you execute the copilot command card, look for:
```
[AM API] ═══ COMMAND CARD TRIGGER ═══
[AM API] triggerAM=true, tabID=tab-4-...
[AM API] ✓ AM System exists
[AM API] ✓ LLM Logger exists for tab ...
[AM API] Provider inference: ... → github-copilot
[AM API] TUI tool detected, using screen snapshot capture
[AM API] ✅ StartConversation returned: convID='...'
```

## Files Modified

- `cmd/forge/main.go` - Added file-based logging initialization

## Previous Issues Addressed

- Logging Policy: `.github/copilot-instructions.md` (v1.21.7-1)
- Validation Hook: `scripts/validate-real-data.sh` (v1.21.7-1)
- ANSI Cleaning: commit bac7c64 (v1.21.6)
- Time-Based Snapshots: commit 38c828c (v1.21.3)

## Download

Binary: `forge-v1.21.7`

```
SHA256: b71f8cb0ae6b3a0373f0be27e3896d58a5e36c856dc70f68279818108f5dd938
Size:   15MB
```

## Testing Instructions

### Step 1: Verify Logging Works
```bash
# Start forge
./forge-v1.21.7

# Should see: "logging to ~/.forge/forge.log"
tail ~/.forge/forge.log
```

### Step 2: Test AM Logging
```bash
# In forge terminal, click copilot command card
# Monitor logs:
tail -f ~/.forge/forge.log | grep -E "AM API|Terminal|StartConversation"
```

### Step 3: Check Conversation Creation
```bash
# After using copilot, check if file was created:
ls -ltr ~/.forge/am/*.json
# Should show a NEW file for your tab-4 (or whatever tab ID)
```

### Step 4: Verify File Content
```bash
# The conversation JSON should exist and contain turns
jq '.turns | length' ~/.forge/am/llm-conv-tab-*.json
```

## Known Issues

None reported - this is a diagnostic release.

## Next Steps

After testing, share:
1. Whether `~/.forge/forge.log` is being created
2. The relevant log lines when using copilot
3. Whether new conversation JSON files appear
4. Any errors in the logs

This will help us identify exactly where AM logging is failing.

