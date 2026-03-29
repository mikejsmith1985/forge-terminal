# CRITICAL: Build Process Safety Rules

## ❌ NEVER DO THIS
```bash
# NEVER build to fterm.exe directly
go build -o fterm.exe ./cmd/forge

# NEVER kill processes by name pattern
Get-Process -Name "forge*" | Stop-Process
taskkill /IM forge*.exe

# NEVER use Stop-Process without specific PID
Stop-Process -Name fterm
```

## ✅ ALWAYS DO THIS
```bash
# ALWAYS build to forge-test.exe
go build -o forge-test.exe ./cmd/forge

# ALWAYS use specific PIDs to kill
Stop-Process -Id 12345

# ALWAYS let user manually update production
# User copies: forge-test.exe -> fterm.exe when they're ready
```

## Why fterm.exe Exists
The production binary is named `fterm.exe` specifically to:
1. Not match `forge-*` wildcard patterns
2. Prevent accidental killing by build scripts
3. Let user control when to update production

## Correct Workflow

### For Testing (AI Agent):
1. Build: `go build -o forge-test.exe ./cmd/forge`
2. Test: `.\forge-test.exe` (runs on different port)
3. Verify it works
4. Tell user it's ready

### For Production (User):
1. User stops their fterm.exe instance
2. User copies: `forge-test.exe` → `fterm.exe`
3. User starts `fterm.exe` again

## Current Situation (2026-01-08)
- ❌ I incorrectly built to fterm.exe (MISTAKE)
- ✅ Frontend is updated in cmd/forge/web/ (safe)
- ✅ forge-test.exe doesn't exist yet (need to build)
- 🔧 User can test with forge-test.exe first, then manually update fterm.exe

## Recovery Steps
```bash
# Build test version
go build -o forge-test.exe ./cmd/forge

# User can test it
.\forge-test.exe
# (runs on port 8333, won't conflict with fterm.exe on different port)

# When ready, user manually copies
# Stop fterm.exe first, then:
copy forge-test.exe fterm.exe
```

## Remember
The AI agent should NEVER touch fterm.exe.
User is in control of their production instance.
