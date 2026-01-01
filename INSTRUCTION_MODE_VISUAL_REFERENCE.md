# Instruction Mode - Visual Reference Guide

## Button States

### OFF State (Instruction Mode Disabled)
```
┌────────────────┐
│ 📄 Instructions│
└────────────────┘
  Gray background (#333)
  Gray text (#888)
  Border: 2px solid #555
  Hover tooltip: "Click to enable custom instructions"
```

### ON State (Instruction Mode Enabled)
```
┌──────────────────────┐
│ 📄 Instructions  ON  │
└──────────────────────┘
  Purple background (#8b5cf6)
  White text (#fff)
  Border: 2px solid #8b5cf6
  Plus adjacent "Edit" button visible
  Hover tooltip: "Custom instructions will be appended to commands"
```

### Edit Button (Only when ON)
```
┌─────┐
│ ✏️ Edit│
└─────┘
  Gray background (#333)
  Gray text (#aaa)
  Border: 2px solid #555
  Appears next to Instructions button
  Click to open editor modal
```

## Editor Modal

### Full Modal Layout
```
┌─────────────────────────────────────────────────────────┐
│ 📄 Custom Instructions                            ✕     │
│ Edit copilot-instructions.md - These instructions will  │
│ be appended to every command when enabled              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ # Custom Instructions for Copilot                │  │
│ │                                                   │  │
│ │ Write your instructions here. They will be       │  │
│ │ appended to every Forge Power Feature command    │  │
│ │ when Instruction Mode is enabled.               │  │
│ │                                                   │  │
│ │ Examples:                                         │  │
│ │ - Code style preferences                         │  │
│ │ - Project-specific conventions                   │  │
│ │ - Architectural guidelines                       │  │
│ │ - Testing requirements                           │  │
│ │                                                   │  │
│ │ These instructions are saved to                 │  │
│ │ copilot-instructions.md in your project.        │  │
│ │                                                   │  │
│ │                                                   │  │
│ │                                                   │  │
│ │                                                   │  │
│ │                                                   │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                              [Cancel] [💾 Save Instructions]│
└─────────────────────────────────────────────────────────┘
```

## Footer Hints

### When Instruction Mode is OFF
```
┌──────────────────────────────────────────────────────┐
│ Press Esc to close • Click to run • 📋 to copy      │
│              Tip: Enable Instructions mode to append  │
│              custom guidelines to commands            │
└──────────────────────────────────────────────────────┘
```

### When Instruction Mode is ON
```
┌──────────────────────────────────────────────────────┐
│ Press Esc to close • Click to run • 📋 to copy      │
│   ✓ Instruction Mode Active - Your custom            │
│   instructions will be appended                       │
└──────────────────────────────────────────────────────┘
```

## User Flow Diagram

```
User Opens Power Features (Ctrl+/)
         ↓
┌─────────────────────────────────┐
│ Header with CLI tabs and...     │
│ [Instructions] [Edit]* buttons  │  (* Edit only when ON)
│                                  │
│ [Search Power Features]          │
│                                  │
│ [Categories & Features]          │
│                                  │
│ Footer with hints               │
└─────────────────────────────────┘
         ↓
  User clicks "Instructions" button
         ↓
   Instructions mode enabled (button turns purple)
         ↓
  User can now click "Edit" button
         ↓
  Modal editor opens with placeholder text
         ↓
  User types custom instructions
         ↓
  User clicks "Save Instructions"
         ↓
  Success toast: "Instructions saved!"
         ↓
  Instructions appended to all future commands
```

## Color Scheme

| Element | OFF State | ON State | Purpose |
|---------|-----------|----------|---------|
| Button Background | #333 (Dark Gray) | #8b5cf6 (Purple) | Shows mode state |
| Button Text | #888 (Gray) | #fff (White) | Readability |
| Button Border | #555 (Medium Gray) | #8b5cf6 (Purple) | Visual emphasis |
| Modal Background | #1a1a1a (Very Dark) | - | Editor contrast |
| Textarea Background | #0a0a0a (Black) | - | Code readability |
| "ON" Badge | - | rgba(255,255,255,0.3) | State indicator |

## Responsive Behavior

### Desktop (1024px+)
- Full-width modal with max-width: 800px
- All buttons and text visible
- Comfortable spacing

### Tablet (768px - 1023px)
- Modal takes up 95% of viewport
- All features still accessible
- Touch-friendly button sizes

### Mobile (< 768px)
- Modal takes up 95% of viewport
- Height: 80% of viewport
- Vertical layout prioritized

## Accessibility Features

✓ Clear button labels (not just icons)
✓ Hover tooltips for all buttons
✓ Visual state indicators (colors + badges)
✓ Proper focus management
✓ ARIA-compatible structure
✓ High contrast text (white on purple, gray on dark)
✓ Keyboard navigation support (Esc to close)

## Interaction States

### Button Hover Effects
```
OFF State Hover:
  Border becomes slightly brighter
  Cursor changes to pointer
  
ON State Hover:
  Border remains bright purple
  Slight shadow enhancement
  Cursor changes to pointer
```

### Modal Interactions
```
Textarea Focus:
  Border glows with accent color
  Cursor shows in text
  Background slightly lighter
  
Save Button Hover:
  Opacity slightly increased
  Cursor changes to pointer
  
Save Button Disabled (Saving):
  Opacity reduced to 0.7
  Cursor changes to not-allowed
  Spinner animation starts
```

## Example Instructions

### React/TypeScript Project
```markdown
# React Development Standards

- React 18+ with TypeScript strict mode
- Use functional components and hooks only
- Follow Airbnb style guide for naming
- Use Tailwind CSS for styling (no inline styles)
- Write tests alongside components
- PropTypes for runtime validation
```

### Python/FastAPI Project
```markdown
# Python/FastAPI Standards

- Python 3.11+
- Type hints on all functions
- Black formatter (88 char limit)
- Pytest for testing
- Docstrings for all public APIs
- FastAPI with Pydantic models
- SQLAlchemy for database
```

### Node.js/Express Project
```markdown
# Node.js API Standards

- Node 20+ with TypeScript
- Express.js framework
- JWT authentication
- MongoDB with Mongoose
- Request validation with Joi
- Error handling middleware
- Logging with Winston
```

---

**Quick Reference**: This guide shows all visual states and interactions for the Instruction Mode feature in Forge Power Features.
