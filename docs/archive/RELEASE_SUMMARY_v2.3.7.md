# Release Summary v2.3.7

**Release Date:** 2025-12-27  
**Type:** Critical Bug Fix  
**Focus:** AM System Restoration

---

## 🚨 Critical Fix

### AM System Not Capturing Sessions

**Root Cause Identified:**
Two separate configuration defaults were disabling the AM (Artificial Memory) system:

1. **Frontend Default:** `amDefaultEnabled` was set to `false` in `App.jsx:148`
2. **Backend Master Control:** `~/.forge/terminal/config.json` had `"amEnabled": false`

**Impact:**
- 13+ days of missing session capture (since 2025-12-14)
- No LLM logger initialization: "NO LLM logger available for tabID"
- No conversation recovery or context preservation
- Legal compliance risk

---

## 🔧 Changes

### Frontend (App.jsx)
```javascript
// BEFORE:
return saved !== null ? saved === 'true' : false; // Default to OFF

// AFTER:
return saved !== null ? saved === 'true' : true; // Default to ON for legal compliance
```

### Backend Config
Users with existing `~/.forge/terminal/config.json` files will need to update:
```json
{
  "amEnabled": true
}
```

Or delete the config file to use system defaults.

### CSS Improvements
- Added `min-height: 0` to `.modal-body` for proper scrolling behavior

---

## ✅ Verification

### Dev Testing Results
- ✅ AM System initialized: `"Initialized (dir: C:\Users\..\.forge\am)"`
- ✅ LLM loggers created: `"Using LLM logger for tabID: ..."`
- ✅ No more "NO LLM logger available" errors
- ✅ Health monitor active and recording heartbeats

### Expected Behavior
After updating to v2.3.7:
1. New installations default to AM enabled
2. Existing users: Check Settings → AM Master Control (should be ON)
3. New tabs automatically enable AM capture
4. LLM interactions captured in `~/.forge/am/` directory

---

## 📋 Deployment Checklist

- [x] Frontend fix committed and pushed
- [x] Git tag v2.3.7 created
- [x] Tag pushed to origin
- [ ] Production build created
- [ ] Binary tested
- [ ] Release notes published on GitHub
- [ ] Production deployment

---

## 🔍 Diagnostic Report Reference

See `AM_LOGGER_DIAGNOSTIC_REPORT_2025-12-27.md` for full investigation details.

---

**Commit:** 9de154d  
**Tag:** v2.3.7  
**Branch:** main
