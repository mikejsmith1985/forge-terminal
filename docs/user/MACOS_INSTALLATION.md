# Mac User Installation Guide

**Having trouble opening Forge Terminal on macOS?** Follow these steps:

---

## 🍎 The Issue

macOS blocks unsigned applications from running to protect users from malware. Since Forge Terminal uses ad-hoc (development) signing, you'll see one of these errors:

- **"forge-darwin-amd64 cannot be opened because the developer cannot be verified"**
- **"forge-darwin-amd64 is damaged and can't be opened"**
- **Nothing happens when you double-click**

This is **normal** and **safe** - we just need to tell macOS to trust the app.

---

## ✅ Solution (Choose One)

### Method 1: Right-Click Open (Easiest)

1. **Right-click** (or Control+click) on the downloaded `forge-darwin-amd64` or `forge-darwin-arm64` file
2. Select **"Open"** from the menu
3. Click **"Open"** in the security dialog
4. Done! The app will now run

**Note:** You only need to do this once. After that, you can open it normally.

---

### Method 2: Terminal Commands (Most Reliable)

1. Open **Terminal** app
2. Navigate to where you downloaded Forge:
   ```bash
   cd ~/Downloads
   ```

3. Remove the quarantine flag and make it executable:
   ```bash
   # For Intel Macs:
   xattr -d com.apple.quarantine forge-darwin-amd64
   chmod +x forge-darwin-amd64
   ./forge-darwin-amd64
   
   # For Apple Silicon (M1/M2/M3) Macs:
   xattr -d com.apple.quarantine forge-darwin-arm64
   chmod +x forge-darwin-arm64
   ./forge-darwin-arm64
   ```

4. Done!

---

### Method 3: System Settings (macOS Ventura+)

If you already tried to open it and got blocked:

1. Open **System Settings**
2. Go to **Privacy & Security**
3. Scroll down to **Security** section
4. You should see: *"forge-darwin-amd64 was blocked..."*
5. Click **"Open Anyway"**
6. Confirm by clicking **"Open"** again

---

## 🤔 Which File Should I Download?

- **Intel Mac** → `forge-darwin-amd64`
- **Apple Silicon (M1/M2/M3)** → `forge-darwin-arm64`

**Not sure which you have?**

1. Click the Apple menu () → **About This Mac**
2. Look at **Chip:**
   - Intel Core i5/i7/i9 → Use **amd64**
   - Apple M1/M2/M3 → Use **arm64**

---

## 🛠️ Troubleshooting

### "Permission denied" error

```bash
chmod +x forge-darwin-*
```

### "Bad CPU type in executable"

You downloaded the wrong architecture:
- Intel Mac tried to run **arm64** → Download **amd64** instead
- Apple Silicon tried to run **amd64** → Download **arm64** instead

### Still not working?

Try this comprehensive fix:

```bash
# Remove all quarantine attributes
sudo xattr -cr forge-darwin-*

# Make executable
chmod +x forge-darwin-*

# Run
./forge-darwin-amd64  # or arm64
```

If you still have issues, please report:
1. Your macOS version (Big Sur, Monterey, Ventura, Sonoma)
2. Your Mac type (Intel or Apple Silicon)
3. The exact error message
4. Screenshot if possible

Open an issue at: https://github.com/mikejsmith1985/forge-terminal/issues

---

## 🔒 Is This Safe?

**Yes!** The reason macOS blocks it is because we don't have an Apple Developer certificate ($99/year).

You can verify the file is safe:
- Check the code: https://github.com/mikejsmith1985/forge-terminal
- Scan with antivirus
- Review the open-source code

---

## 🚀 Future: Notarized Releases

We're working on getting proper Apple code signing so you won't need to do this in future releases. This requires:
- Apple Developer Program membership ($99/year)
- Code signing infrastructure
- Testing across multiple macOS versions

**Want to help?** If you have an Apple Developer account, see `docs/developer/macos-fork-setup.md` for how to create notarized builds.

---

## 📝 After Installation

Once you get Forge running:
1. Check out the **README.md** for features
2. Try `Ctrl+Shift+P` for command palette
3. Join our community for support

---

**Last Updated:** 2025-12-08
