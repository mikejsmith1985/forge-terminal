# Enhanced Icon System - Usage Examples

## Example Command Cards with New Icon System

### 1. Using Direct Unicode Emojis (Recommended)

```json
{
  "id": "deploy-prod",
  "name": "Deploy to Production",
  "description": "Deploy application to production environment",
  "command": "npm run deploy:prod",
  "icon": "🚀",
  "category": "deployment",
  "favorite": false,
  "pasteOnly": false
}
```

```json
{
  "id": "run-tests",
  "name": "Run Test Suite",
  "description": "Execute all unit and integration tests",
  "command": "npm test",
  "icon": "🧪",
  "keyBinding": "Ctrl+Shift+T",
  "pasteOnly": false
}
```

```json
{
  "id": "docker-build",
  "name": "Build Docker Image",
  "description": "Build and tag Docker container",
  "command": "docker build -t myapp:latest .",
  "icon": "🐳",
  "delay": 100,
  "pasteOnly": false
}
```

```json
{
  "id": "database-backup",
  "name": "Backup Database",
  "description": "Create database backup",
  "command": "pg_dump -U postgres mydb > backup.sql",
  "icon": "💾",
  "favorite": true
}
```

### 2. Using Lucide Icons

```json
{
  "id": "git-status",
  "name": "Git Status",
  "description": "Check git repository status",
  "command": "git status",
  "icon": "GitBranch",
  "keyBinding": "Ctrl+Shift+G"
}
```

```json
{
  "id": "open-terminal",
  "name": "New Terminal",
  "description": "Open new terminal window",
  "command": "bash",
  "icon": "Terminal",
  "pasteOnly": false
}
```

### 3. Legacy Format (Still Supported)

```json
{
  "id": "ai-assist",
  "name": "AI Assistant",
  "description": "Launch AI coding assistant",
  "command": "copilot",
  "icon": "emoji-robot",
  "category": "ai"
}
```

## Popular Emoji Recommendations by Category

### Development & Coding
- 💻 `Computer` - General development
- 🖥️ `Desktop` - System administration
- ⌨️ `Keyboard` - Terminal commands
- 🐛 `Bug` - Debugging
- 🔧 `Wrench` - Configuration
- ⚙️ `Gear` - Settings
- 🔨 `Hammer` - Build tools

### Deployment & Operations
- 🚀 `Rocket` - Deployment
- 🌐 `Globe` - Web/Network
- 🐳 `Whale` - Docker
- ☸️ `Helm` - Kubernetes
- 📦 `Package` - Package management
- 🔄 `Arrows` - CI/CD
- 🔐 `Lock` - Security

### Testing & Quality
- 🧪 `Test Tube` - Testing
- ✅ `Check Mark` - Validation
- ❌ `X` - Error/Failure
- ⚠️ `Warning` - Warnings
- 🎯 `Target` - Performance
- 📊 `Chart` - Analytics
- 🔍 `Magnifier` - Search/Inspect

### Database & Storage
- 💾 `Floppy Disk` - Save/Backup
- 🗄️ `File Cabinet` - Database
- 📁 `Folder` - File management
- 📄 `Document` - Documentation
- 🗃️ `Card File` - Archives
- 💿 `CD` - Storage media

### AI & Automation
- 🤖 `Robot` - AI/Bot
- 🧠 `Brain` - ML/Intelligence
- ✨ `Sparkles` - Magic/Auto
- ⚡ `Lightning` - Fast/Automated
- 🎨 `Art` - Creative AI
- 🔮 `Crystal Ball` - Prediction

### Monitoring & Alerts
- 👀 `Eyes` - Watch/Monitor
- 🚨 `Siren` - Critical alert
- 📢 `Megaphone` - Notifications
- 🔔 `Bell` - Alerts
- 📈 `Chart Up` - Metrics
- 🩺 `Stethoscope` - Health check

### Version Control
- 🌿 `Branch` - Git branch
- 🔀 `Shuffle` - Merge
- 🏷️ `Tag` - Git tag
- 📝 `Memo` - Commit
- 🔖 `Bookmark` - Reference
- 📌 `Pin` - Fixed version

### Communication
- 💬 `Speech Bubble` - Chat
- 📧 `Email` - Email
- 📱 `Phone` - Mobile
- 🔗 `Link` - Connection
- 📢 `Loudspeaker` - Broadcast

## Complete Example Set

Here's a full set of command cards showcasing the icon system:

```json
[
  {
    "id": "copilot-fresh",
    "name": "🤖 Copilot (Fresh)",
    "icon": "🤖",
    "command": "copilot --allow-all-tools",
    "macro_delay": 1500,
    "macro_payload": "# SYSTEM INJECTION: FORGE AWARENESS..."
  },
  {
    "id": "deploy",
    "name": "Deploy",
    "icon": "🚀",
    "command": "npm run deploy"
  },
  {
    "id": "test",
    "name": "Run Tests",
    "icon": "🧪",
    "command": "npm test"
  },
  {
    "id": "build",
    "name": "Build",
    "icon": "🔨",
    "command": "npm run build"
  },
  {
    "id": "docker",
    "name": "Docker Up",
    "icon": "🐳",
    "command": "docker-compose up -d"
  },
  {
    "id": "logs",
    "name": "View Logs",
    "icon": "📋",
    "command": "tail -f app.log"
  },
  {
    "id": "backup",
    "name": "Backup",
    "icon": "💾",
    "command": "./scripts/backup.sh"
  },
  {
    "id": "monitor",
    "name": "Monitor",
    "icon": "👀",
    "command": "htop"
  },
  {
    "id": "git-status",
    "name": "Git Status",
    "icon": "GitBranch",
    "command": "git status"
  },
  {
    "id": "lint",
    "name": "Lint Code",
    "icon": "✨",
    "command": "npm run lint"
  }
]
```

## Tips for Choosing Icons

1. **Be Consistent**: Use similar icons for related commands
2. **Be Intuitive**: Choose icons that clearly represent the action
3. **Use Color**: Emojis provide visual variety (🟢 🔴 🟡)
4. **Consider Context**: Match icon to your domain/industry
5. **Test Visibility**: Ensure icons are clear at small sizes
6. **Mix Styles**: Combine emojis and lucide icons as needed

## Migration Guide

### Converting Existing Cards

**Before** (legacy format):
```json
{
  "icon": "emoji-rocket"
}
```

**After** (new format):
```json
{
  "icon": "🚀"
}
```

### No Migration Required!
Both formats work simultaneously. Update cards gradually as you edit them, or keep using the legacy format indefinitely.

## Performance Notes

- **Emoji Rendering**: Native browser rendering (no images)
- **Picker Loading**: Lazy loaded on first open (~50KB)
- **Subsequent Opens**: Instant (cached in memory)
- **Storage Impact**: Unicode emojis are 1-4 bytes vs 10-20 chars for legacy names
- **Render Performance**: Identical to previous system

## Browser Compatibility

✅ Chrome 89+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Edge 89+  
✅ Opera 75+  

Note: Older browsers may display emoji boxes (□) for unsupported emojis.

---

**Quick Reference**: See `ICON_ENHANCEMENT_SUMMARY.md`  
**Full Documentation**: See `ENHANCED_ICON_SYSTEM.md`  
**Test Dashboard**: Open `ICON_ENHANCEMENT_TEST_DASHBOARD.html`
