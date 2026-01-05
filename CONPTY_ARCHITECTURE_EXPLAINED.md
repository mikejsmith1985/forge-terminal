# ConPTY Architecture: No Visible Windows Ever Open

## ❓ Your Question
> "I don't want the user seeing a new shell opening though, and if they do they'll just close it so how does that get handled?"

## ✅ Answer: NO WINDOWS EVER OPEN

**There are ZERO visible windows.** Everything happens invisibly in the background.

---

## 🏗️ How ConPTY Actually Works

### Traditional Windows Console (The OLD Way)
```
User clicks PowerShell icon
    ↓
Windows creates NEW CONSOLE WINDOW (conhost.exe)
    ↓
PowerShell.exe attaches to that window
    ↓
User sees: [New window pops up with PowerShell prompt]
```

### ConPTY (Console Pseudo-Terminal) - The MODERN Way
```
Forge calls conpty.Start("powershell.exe")
    ↓
Windows creates HIDDEN console buffer (no window)
    ↓
PowerShell.exe runs HEADLESS (no visible UI)
    ↓
Forge reads/writes to buffer via file descriptor
    ↓
Forge renders output in web UI
    ↓
User sees: [Terminal output inside Forge's browser window ONLY]
```

---

## 🔍 Proof: No Visible Windows

### Check Running Forge Process
```powershell
PS> Get-Process -Name forge* | Select-Object Name, Id, MainWindowHandle

Name                   Id MainWindowHandle
----                   -- ----------------
forge-windows-amd64 25472                0
                           ↑
                           Zero = NO WINDOW
```

**MainWindowHandle = 0** means the process has NO graphical window.

### Why No Window?
The Makefile compiles Forge with this flag:
```makefile
LDFLAGS_WIN := -ldflags "-H windowsgui"
          This tells Windows: ^^^^^^^^^^^^
          "Don't create a console window for this .exe"
```

**Result:** Forge is a **background web server** with no visible window.

---

## 📊 Complete Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  USER'S BROWSER (http://localhost:8333)             │
│  ┌───────────────────────────────────────────────┐  │
│  │  Forge Web UI (React/Vite frontend)           │  │
│  │  Shows terminal with xterm.js                 │  │
│  └─────────────────┬─────────────────────────────┘  │
│                    │ WebSocket                      │
└────────────────────┼────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│  FORGE BACKEND (Go web server - NO WINDOW)          │
│  Process ID: 25472                                  │
│  MainWindowHandle: 0 (invisible)                    │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  WebSocket Handler (gorilla/websocket)       │  │
│  │  Receives: User keyboard input                │  │
│  │  Sends: Terminal output                       │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                 │
│                   ↓                                 │
│  ┌──────────────────────────────────────────────┐  │
│  │  ConPTY Bridge (github.com/.../conpty)       │  │
│  │  - File descriptor to hidden console         │  │
│  │  - Reads/writes raw bytes                    │  │
│  └────────────────┬─────────────────────────────┘  │
└───────────────────┼─────────────────────────────────┘
                    │ Win32 ConPTY API
                    ↓
┌─────────────────────────────────────────────────────┐
│  WINDOWS CONPTY (Kernel-level pseudo-terminal)      │
│  - Hidden console buffer (NO VISIBLE WINDOW)        │
│  - Managed by conhost.exe (background process)      │
│  - Screen buffer: 120x30 characters (in memory)     │
└────────────────┬────────────────────────────────────┘
                 │ Process spawn
                 ↓
┌─────────────────────────────────────────────────────┐
│  POWERSHELL.EXE (Child process - NO WINDOW)         │
│  Process ID: 27834                                  │
│  Parent: Forge (25472)                              │
│  Attached to: ConPTY buffer (not a visible window)  │
│                                                     │
│  Believes it's running in a "real" console          │
│  Can use colors, cursor movements, etc.             │
│  But output goes to BUFFER, not a WINDOW            │
└─────────────────────────────────────────────────────┘
```

---

## 🎬 Step-by-Step: What Happens When User Opens a Terminal Tab

### 1. User clicks "New Tab" in Forge UI
- Browser sends WebSocket message: `{"action": "create_terminal"}`

### 2. Forge Backend Receives Request
```go
// internal/terminal/handler.go
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    // Upgrade HTTP to WebSocket
    conn, _ := h.upgrader.Upgrade(w, r, nil)
    
    // Create PTY (NO WINDOW CREATED HERE)
    pty, _ := startPTYWithShell("powershell.exe", []string{}, workingDir)
}
```

### 3. ConPTY Creates Hidden Console
```go
// internal/terminal/pty_windows.go
cpty, err := conpty.Start("powershell.exe")
// ↑ This calls Windows CreatePseudoConsole() API
// NO WINDOW IS CREATED - only a memory buffer
```

### 4. PowerShell Starts (Invisible)
- Windows spawns `powershell.exe` as child of Forge
- PowerShell attaches to ConPTY buffer (not a window)
- PowerShell thinks it's in a console (screen buffer exists)
- **But there's no GUI window to show**

### 5. Forge Injects Environment Variables
```go
// After 100ms, Forge writes to the PTY buffer:
cpty.Write([]byte("$env:FORGE_INSTANCE_PID=25472\r"))
cpty.Write([]byte("$env:FORGE_INSTANCE_PORT=8333\r"))
cpty.Write([]byte("clear\r"))
```

**What PowerShell sees:** Exactly as if user typed those commands via keyboard
**What user sees:** Nothing yet (clear command hides the setup)

### 6. PowerShell Prompt Appears
```
PS C:\ProjectsWin\forge-terminal>
```
This text is in the **ConPTY buffer** (not a window).

### 7. Forge Reads Buffer and Sends to Browser
```go
// Read loop in Forge:
for {
    buf := make([]byte, 4096)
    n, _ := pty.Read(buf)  // Read from ConPTY buffer
    
    ws.WriteMessage(websocket.BinaryMessage, buf[:n])  // Send to browser
}
```

### 8. Browser Displays in xterm.js
- JavaScript terminal emulator receives the bytes
- Renders them as text with colors/formatting
- User sees terminal **inside browser window**

---

## 🔐 Why This Matters for Process Safeguard

### The Problem We're Solving
User might run: `Stop-Process -Id 25472`

If PID 25472 is the **Forge main process**, this kills:
1. The web server (bye-bye browser connection)
2. All ConPTY buffers (bye-bye all terminal tabs)
3. All child PowerShell processes
4. **ALL UNSAVED WORK**

### The Solution
When PowerShell starts in ConPTY buffer, Forge types:
```powershell
$env:FORGE_INSTANCE_PID=25472
```

Later, if user loads safeguard script and tries:
```powershell
Stop-ProcessSafe -Id 25472
```

Script checks:
```powershell
if ($env:FORGE_INSTANCE_PID -eq 25472) {
    Write-Host "❌ DANGER: This is your active Forge session!"
    # Block the kill
}
```

---

## ⚠️ Key Limitations (Why We Need Layer 2)

### The Environment Variable Is Not "Real"

**On Unix/Linux (true PTY):**
```bash
# You can see it in the process environment:
cat /proc/$$/environ | tr '\0' '\n' | grep FORGE
FORGE_INSTANCE_PID=12345
```

**On Windows (ConPTY):**
```powershell
# You CAN'T see it in the process object:
PS> (Get-Process -Id $PID).StartInfo.EnvironmentVariables["FORGE_INSTANCE_PID"]
# Returns: null (not in process environment block)

# But you CAN see it in the shell:
PS> $env:FORGE_INSTANCE_PID
25472  # This works!
```

**Why?** Because it was **typed into the shell**, not injected into the process environment.

### User Can Bypass It
```powershell
PS> Remove-Item Env:\FORGE_INSTANCE_PID
PS> $env:FORGE_INSTANCE_PID
# Returns: (empty) - user deleted it
```

### That's Why Port Ownership (Layer 2) Is Critical
```powershell
PS> Get-NetTCPConnection -LocalPort 8333 -State Listen | Select-Object OwningProcess
OwningProcess
-------------
        25472  # Can't be faked or deleted!
```

**This is why the safeguard uses 5 layers** - if Layer 1 (env var) fails, Layer 2 (port) catches it.

---

## 🧪 Verify It Yourself

### Test 1: Confirm No Visible Windows
```powershell
# Get Forge PID
$forgePID = Get-Process -Name forge* | Select-Object -ExpandProperty Id

# Check if it has a window
$proc = Get-Process -Id $forgePID
$proc.MainWindowHandle
# Output: 0 (no window)

$proc.MainWindowTitle
# Output: (empty string - no window title)
```

### Test 2: Find Hidden Child Processes
```powershell
# List all PowerShell processes owned by Forge
Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | 
    Where-Object { $_.ParentProcessId -eq $forgePID } |
    Select-Object ProcessId, CommandLine, MainWindowHandle

# You'll see:
ProcessId CommandLine                    MainWindowHandle
--------- -----------                    ----------------
    27834 powershell.exe                             0
    28991 powershell.exe                             0
# MainWindowHandle = 0 means NO WINDOW for these too!
```

### Test 3: Check Environment Variable in Forge Terminal
Open a terminal tab in Forge UI and type:
```powershell
PS> $env:FORGE_INSTANCE_PID
25472  # Your Forge PID - it works!

PS> $env:FORGE_INSTANCE_PORT  
8333   # Your Forge port

PS> echo "This is all happening invisibly"
This is all happening invisibly
```

**You're typing in the browser, output renders in the browser, but the PowerShell process itself has NO WINDOW.**

---

## 📖 Summary

| What User Sees | What Actually Happens |
|----------------|----------------------|
| Forge app in browser | Go web server (no window) |
| Terminal tab in browser | ConPTY hidden buffer |
| PowerShell prompt in browser | powershell.exe (no window) |
| Colored output in browser | ANSI codes rendered by xterm.js |
| Clicks "New Tab" | New ConPTY buffer created (still no window) |

**No windows ever open. No windows can be closed. Everything is headless.**

The "environment variable injection" happens by **typing commands into the invisible ConPTY buffer**, which PowerShell receives as keyboard input.

---

## 🎯 Why This Architecture Is Genius

1. **Cross-platform:** ConPTY on Windows, PTY on Linux/Mac
2. **Web-based:** Access terminal from any browser
3. **Multiple tabs:** Each gets its own ConPTY buffer
4. **No flickering windows:** Professional UX
5. **Screen capture works:** ConPTY buffer has full ANSI support
6. **Process safeguard possible:** Can inject protective env vars

The only downside: **Windows ConPTY can't inject true process environment variables**, so we work around it by typing commands.

---

*If the user could close a window, that would mean we failed and created a visible console - which we explicitly prevent with `-H windowsgui` at compile time.*
