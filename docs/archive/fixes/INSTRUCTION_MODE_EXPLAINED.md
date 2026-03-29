# Instruction Mode - Quick Reference

**What is Instruction Mode?**
Instruction Mode automatically appends custom project instructions to every CLI command you send, ensuring the AI follows your project's guidelines, coding standards, and architectural decisions.

---

## 🎯 Purpose

When working on a project, you often want the AI to:
- Follow specific coding standards
- Use certain architectural patterns
- Remember project context
- Adhere to team conventions

Instead of copying/pasting these instructions every time, **Instruction Mode does it automatically**.

---

## 🔧 How It Works

### 1. **Create Instruction Files**

Place markdown files in your project root with naming conventions:
- `CLAUDE.md` - For Claude Code
- `copilot-instructions.md` - For GitHub Copilot  
- `.cursorrules` - For Cursor AI
- `instructions.md` - Generic (works with all)

### 2. **Enable Instruction Mode**

In Forge Assist (Ctrl+/):
- Click the **"Files"** button (with FileText icon)
- Button turns purple with "ON" badge when active

### 3. **Commands Auto-Enhanced**

When enabled, every command you send gets your instructions appended:

**Without Instruction Mode:**
```
refactor this function
```

**With Instruction Mode ON:**
```
refactor this function

---
Project Instructions (from CLAUDE.md):
- Use TypeScript strict mode
- Write unit tests for all functions
- Follow functional programming patterns
- Use descriptive variable names
```

---

## 📋 Example Instruction File

### `CLAUDE.md`
```markdown
# Project Instructions for Claude

## Overview
This is a React + TypeScript project using Vite.

## Coding Standards
- Use functional components (no class components)
- Use TypeScript strict mode
- Prefer `const` over `let`
- All props must have TypeScript interfaces

## Testing
- Write unit tests with Vitest
- Aim for 80%+ code coverage
- Test edge cases and error handling

## Architecture
- Keep components under 200 lines
- Extract complex logic into custom hooks
- Use Context API for global state (no Redux)

## File Naming
- Components: PascalCase.tsx
- Hooks: useCamelCase.ts
- Utils: camelCase.ts
```

---

## 🆚 Instruction Mode vs Quick Instructions

| Feature | Instruction Mode | Quick Instructions |
|---------|-----------------|-------------------|
| Source | Markdown files in project | Inline text snippets |
| Persistence | Per-project (file-based) | Global (localStorage) |
| Length | Full documents (unlimited) | Short snippets (< 500 chars) |
| Best For | Project-specific guidelines | Reusable one-liners |
| Examples | Architecture docs, standards | "Use TypeScript", "Add tests" |

**Use Together:** Enable both for maximum control!

---

## ✅ When to Use Instruction Mode

✓ **Working on a team project** - Ensure consistency  
✓ **Large codebase** - Maintain architectural patterns  
✓ **Specific tech stack** - Enforce framework conventions  
✓ **Training AI** - Teach project-specific context  
✓ **Onboarding** - New AI interactions get full context  

---

## ⚡ Quick Example Workflow

1. **Create** `CLAUDE.md` in project root:
```markdown
# Project: E-commerce API

## Stack
- Node.js + Express + PostgreSQL
- Use async/await (no callbacks)
- All endpoints must have error handling

## Database
- Use Prisma ORM (no raw SQL)
- Migrations before schema changes
```

2. **Enable** Instruction Mode in Forge Assist

3. **Ask AI:** "add a new product endpoint"

4. **AI sees:**
```
add a new product endpoint

---
[Your full CLAUDE.md instructions auto-appended]
```

5. **Result:** AI generates code following your exact stack and patterns

---

## 🎨 Visual Indicators

**Button States:**
- **Gray + "OFF"** - Instruction Mode disabled
- **Purple + "ON"** - Instruction Mode enabled
- **Shows file name** - "Active file: CLAUDE.md ✓"

**Where to Find:**
- Forge Assist modal (Ctrl+/)
- Top right area, next to "Quick" button
- FileText icon

---

## 🛠️ Managing Instruction Files

Click the **Settings gear** button in Forge Assist to:
- Create new instruction files
- Edit existing files
- Switch between files
- Preview what will be appended

**Templates Available:**
- `CLAUDE.md` - Claude Code template
- `copilot-instructions.md` - Copilot template
- `.cursorrules` - Cursor template
- `instructions.md` - Generic template

---

## 💡 Pro Tips

1. **Keep it concise** - Focus on what's unique to your project
2. **Update regularly** - Reflect architectural changes
3. **Use examples** - Show code patterns, not just rules
4. **Structure with headers** - Makes it scannable
5. **Combine with Quick Instructions** - Short overrides for specific tasks

---

## 🚫 What Instruction Mode Does NOT Do

❌ Doesn't replace your prompts (appends to them)  
❌ Doesn't work without an instruction file  
❌ Doesn't auto-detect project type (you write instructions)  
❌ Doesn't modify AI responses (only input)  

---

## 📝 Summary

**Instruction Mode** = Auto-append project guidelines to every AI command

**When ON:**
- Your `CLAUDE.md` (or similar) is automatically added to every prompt
- AI follows your project's coding standards without reminders
- Saves time, ensures consistency

**When OFF:**
- Regular prompts, no auto-appending
- Useful for quick one-off questions

**Toggle anytime** - No restart needed, instant effect

---

**Quick Start:** Create `CLAUDE.md` in your project → Enable Instruction Mode → Ask AI anything → AI follows your guidelines automatically. 🚀
