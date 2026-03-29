# Instruction Mode Quick Reference

## What Is It?

The **Instruction Mode** feature allows you to automatically append custom instructions from `copilot-instructions.md` to every command sent through Forge Assist.

## Where Is It?

In the **Forge Assist** modal (opened with `Ctrl+/`)

## How to Use

### Enable Instruction Mode
1. Open Forge Assist (`Ctrl+/`)
2. In the header (right side), click the **FileText** icon button
3. Button will show "ON" with purple background

### Edit Instructions
1. With Instruction Mode enabled, click the **Edit** button (pencil icon)
2. Modal opens showing the editor
3. Add or modify your custom instructions
4. Click **Save Changes**
5. Toast confirms: "Instructions saved!"

### Use in Commands
1. Instruction Mode is **ON**
2. Select any power feature in Forge Assist
3. Command executes **with instruction reminder appended**:
   ```
   [your command]
   
   # Please follow and reference the instructions in copilot-instructions.md
   ```
4. Forge Assist closes automatically

## Settings

- **Persistence:** State saved to browser localStorage
- **File Location:** `copilot-instructions.md` in project root
- **Auto-append:** Only works when mode is ON and file has content

## Tips

✅ **Best Practices**
- Add coding standards and conventions
- Document team guidelines
- Include testing requirements
- Reference external resources

✅ **Works With**
- All Forge Assist power features
- Both Claude and Copilot CLI tools
- All command types

❌ **Doesn't Work With**
- Manual terminal input (only power features)
- Non-Forge-Assist commands

## Examples

### Example Instructions File

```markdown
# Development Guidelines

## Code Quality
- Always use TypeScript (no any types)
- Write tests for new features
- Use descriptive variable names

## Version Control
- Use feature branches
- Write clear commit messages
- Squash before merge

## Documentation
- Add JSDoc for functions
- Update README
- Keep CHANGELOG updated
```

### What Gets Appended

When you execute a power feature with Instruction Mode ON:

```bash
# Original Command
copilot -p "refactor this function"

# Becomes
copilot -p "refactor this function

# Please follow and reference the instructions in copilot-instructions.md"
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+/` | Open Forge Assist |
| `Escape` | Close Instruction Editor |
| `Escape` | Close Forge Assist |

## Troubleshooting

### "Edit button doesn't appear"
- Make sure Instruction Mode is ON (FileText button shows "ON")
- Toggle OFF and ON again

### "Instructions don't append to commands"
- Check that Instruction Mode is ON
- Verify instructions file has content
- Check browser console for errors

### "Changes not saved"
- Look for success toast: "Instructions saved!"
- Check that file was created in project root
- Verify API permission issues in logs

### "Instruction Mode keeps turning OFF"
- Browser might be clearing localStorage
- Check browser privacy settings
- Try a different browser

## File Locations

- **Instructions File:** `copilot-instructions.md`
- **Component:** `frontend/src/components/ForgeAssist.jsx`
- **Styles:** `frontend/src/components/ForgeAssist.css`

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/files/read?path=copilot-instructions.md` | GET | Load instructions |
| `/api/files/write` | POST | Save instructions |

## Integration

Instruction Mode integrates with:
- ✅ Forge Assist (power features)
- ✅ ForgeTerminal (command execution)
- ✅ Copilot CLI
- ✅ Claude CLI
- ✅ localStorage (persistence)
- ✅ File system (`copilot-instructions.md`)

## History

- **Before:** Instruction Mode was in ChatView (now deleted)
- **Now:** Moved to Forge Assist
- **Same:** File, behavior, UI/UX
- **Enhanced:** Better integration with power features workflow

---

**Version:** 1.0
**Last Updated:** 2026-01-01
**Status:** ✅ Ready to Use
