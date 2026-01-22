# Windows Defender / SmartScreen False Positive Information

## Issue
Microsoft Edge and Windows Defender may flag Forge Terminal (`fterm.exe`) as a potential threat. This is a **FALSE POSITIVE**.

## Why This Happens
Go binaries, especially those that:
- Use Windows APIs (terminal control, file locking, process management)
- Make network requests (updater feature)
- Have stripped symbols for size reduction
- Are not from a Microsoft-verified publisher

...are commonly flagged by heuristic antivirus engines.

## What We've Done (v3.16.6+)

### 1. **Embedded Version Information**
- Added complete PE version resource with company, product, and copyright info
- Includes application manifest with execution level declarations
- Added DPI awareness settings for proper Windows integration

### 2. **Build Improvements**
- Using `-trimpath` to remove local file paths from binary
- Embedded manifest declares: `<requestedExecutionLevel level="asInvoker" uiAccess="false"/>`
- Version info clearly identifies the application as "Forge Terminal"

### 3. **Transparency**
- **Source Code**: Fully open source at https://github.com/mikejsmith1985/forge-terminal
- **Build Process**: GitHub Actions workflow is publicly visible
- **Reproducible Builds**: Anyone can verify the binary matches the source

## How to Download Safely

### Option 1: Bypass SmartScreen (Recommended)
1. Click "Download" on the release page
2. If Edge blocks it, click the three dots `...` in the download bar
3. Select **"Keep"** → **"Show more"** → **"Keep anyway"**
4. The file is safe to run

### Option 2: Build from Source
```powershell
git clone https://github.com/mikejsmith1985/forge-terminal.git
cd forge-terminal
.\generate-windows-resources.ps1  # Embed version info
make build-windows
```

### Option 3: Whitelist in Windows Defender
1. Open **Windows Security** → **Virus & threat protection**
2. Under **Virus & threat protection settings**, click **Manage settings**
3. Scroll to **Exclusions** → **Add or remove exclusions**
4. Click **Add an exclusion** → **File** → Browse to `fterm.exe`

## Verification

### Check File Signature
```powershell
Get-AuthenticodeSignature .\fterm.exe
```

### Check File Properties
Right-click `fterm.exe` → **Properties** → **Details** tab
You should see:
- **Product name**: Forge Terminal
- **File version**: 3.16.6.0
- **Copyright**: Copyright © 2026 Forge Terminal Project

### Scan with VirusTotal
Upload to https://www.virustotal.com and check results. Most engines will show clean.

## What's Actually in the Binary?

Forge Terminal uses the following Windows APIs (not malicious):
- `kernel32.dll:LockFileEx` - File locking for single-instance enforcement
- `user32.dll:MessageBoxW` - Error dialog display
- `conpty` - Windows Console Pseudo Terminal for terminal emulation

All of these are **standard, legitimate Windows APIs** used by terminal applications.

## Code Signing Status

**Current**: Ad-hoc signed (development)
**Future**: Awaiting Microsoft code signing certificate ($$$)

Code signing certificates cost **$400-600/year** and require legal entity verification. As an open-source project, we're exploring:
- Community funding for signing certificate
- GitHub Sponsors for sustainable signing
- Microsoft Store distribution (auto-signed)

## Still Concerned?

1. **Read the source**: Every line is on GitHub
2. **Check the build**: GitHub Actions logs are public
3. **Scan it**: Use multiple AV engines
4. **Run in sandbox**: Use Windows Sandbox to test first

## Report Legitimate Threats

If you find **actual malicious code** (not a false positive), please report via:
- GitHub Security Advisory
- security@[project-domain]

---

**TL;DR**: It's a false positive. The binary is safe. Bypass SmartScreen or build from source.
