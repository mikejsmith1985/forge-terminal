# Feature Specification: Monaco Editor Markdown Preview Toggle

**Feature Branch**: `feature/009-monaco-md-preview`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "can you modify the Monaco Editor pane that opens to have a toggle for a MD viewer that shows the actual md in its formated context instead of the raw output?"

---

## Problem Statement

The Monaco Editor pane currently displays Markdown files as raw source text. Developers editing specification documents, changelogs, and other Markdown content must mentally parse the syntax to understand the final rendered appearance. There is no way to see the formatted output without opening the file in an external viewer. This breaks the editing flow and forces developers to context-switch when reviewing prose-heavy documents.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Toggle Between Edit and Preview Modes (Priority: P1)

A developer has a Markdown file open in the Monaco Editor pane. They want to review how the document looks rendered, then continue editing. They click a toggle button in the pane header. The raw editor is replaced by a formatted Markdown preview. They read the preview, click the toggle again, and the editor returns — with no content lost.

**Why this priority**: The toggle is the entire feature. Without it, nothing else exists.

**Independent Test**: Open any `.md` file in the Monaco pane. Locate the toggle control. Click it once — the pane must switch to formatted preview. Click again — the editor must return. This is a standalone, fully testable slice of value.

**Acceptance Scenarios**:

1. **Given** a Markdown file is open in the Monaco Editor pane, **When** the developer clicks the toggle control, **Then** the pane displays a formatted preview of the Markdown content, and the raw editor is hidden.
2. **Given** the pane is showing the formatted preview, **When** the developer clicks the toggle control again, **Then** the pane returns to the Monaco editor with the full content intact and unchanged, scrolled to the same position and with the cursor at the same location as when preview was activated.
3. **Given** the developer has typed unsaved changes in the editor, **When** they toggle to preview, **Then** the preview reflects the current in-memory content, not the last saved version.
4. **Given** the pane is in preview mode, **When** the developer switches to a different pane and returns, **Then** the pane remains in preview mode (state is preserved within the session).

---

### User Story 2 — Markdown Content Renders Correctly (Priority: P2)

A developer previews a spec file containing headings, code blocks, tables, bold/italic text, and links. All elements render faithfully — the preview matches what they would see on GitHub or a standard Markdown reader.

**Why this priority**: A preview that renders only headings but misses tables or code blocks is misleading. Completeness of rendering is essential to the feature being useful.

**Independent Test**: Open a spec file that includes headings (H1–H4), a fenced code block, a Markdown table, bold/italic inline text, and a hyperlink. Toggle to preview. Verify each element type renders correctly.

**Acceptance Scenarios**:

1. **Given** the Markdown file contains ATX headings (H1–H6), **When** preview is shown, **Then** each heading renders at the correct visual weight.
2. **Given** the file contains a fenced code block with a language hint, **When** preview is shown, **Then** the code renders in a monospace block with the code text preserved.
3. **Given** the file contains a Markdown table, **When** preview is shown, **Then** the table renders as a formatted grid with column headers and rows.
4. **Given** the file contains bold (`**`), italic (`*`), and inline code (`` ` ``) spans, **When** preview is shown, **Then** each renders with the correct visual treatment.
5. **Given** the file contains a hyperlink, **When** preview is shown, **Then** the link text is clickable (or at minimum visually distinguished), and the URL is accessible via hover or tooltip.

---

### User Story 3 — Toggle Is Only Available for Markdown Files (Priority: P3)

When a non-Markdown file is open (e.g., a Go source file, a JSON config), the toggle control is not shown. The developer does not see a non-functional button for file types where Markdown preview makes no sense.

**Why this priority**: A preview toggle on a Go file is confusing and pointless. Scoping the toggle to Markdown keeps the UI clean.

**Independent Test**: Open a `.go` file in the Monaco pane. Confirm the toggle control is absent. Open a `.md` file. Confirm it appears.

**Acceptance Scenarios**:

1. **Given** a non-Markdown file is open in the Monaco pane (e.g., `.go`, `.json`, `.ts`), **When** the pane is displayed, **Then** no toggle control is visible.
2. **Given** a `.md` file is open, **When** the pane is displayed, **Then** the toggle control is visible.
3. **Given** a file with no extension is open, **When** the pane is displayed, **Then** the toggle control is not shown (Markdown is inferred only from `.md` extension; content-based detection is out of scope for v1).

---

### Edge Cases

- What happens if the Markdown contains embedded HTML? Potentially unsafe HTML must be sanitised before rendering to prevent script injection in the app's frontend context.
- What happens with a very large Markdown file (10,000+ lines)? The preview must not freeze the UI; rendering may be deferred or virtualised, but the editor must remain responsive.
- What happens if the file is empty? The preview shows a blank area — no error or crash.
- What happens if the file is renamed to or from `.md` while open? The toggle's availability is evaluated at open time; a rename requires re-opening the file (out of scope).
- What happens if the user edits the file while in preview mode? The toggle shows a read-only preview; editing is only possible in editor mode.
- What happens if the Markdown renderer fails (throws an error or runs out of memory during parse)? The preview area displays a non-technical error message (e.g., "Preview could not be generated — toggle back to edit the file"). The pane stays in Preview Mode; the developer toggles back manually.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Monaco Editor pane MUST display a clearly labelled toggle control (button or icon) in the pane header when the open file has a `.md` extension. The toggle control MUST be keyboard-focusable (reachable via Tab key) and activatable via Enter or Space — no dedicated keyboard chord is required.
- **FR-002**: The toggle control MUST NOT be visible when the open file does not have a `.md` extension.
- **FR-003**: Activating the toggle MUST replace the Monaco editor view with a formatted Markdown preview that renders the current in-memory content.
- **FR-004**: Activating the toggle a second time MUST restore the Monaco editor view with the original content preserved, byte-for-byte.
- **FR-005**: The preview MUST correctly render all standard CommonMark elements: headings (H1–H6), paragraphs, bold, italic, inline code, fenced code blocks, ordered and unordered lists, blockquotes, Markdown tables, and hyperlinks. Fenced code blocks render in a monospace block with the code text preserved; language-specific syntax highlighting is out of scope for v1.
- **FR-006**: Any embedded HTML in the Markdown MUST be sanitised before rendering to prevent script injection or layout disruption within the app.
- **FR-007**: The current view mode (editor or preview) MUST persist while the file remains open — switching to another pane and returning does not reset the toggle. Closing and reopening the file always starts in Edit Mode; view state is not persisted across file open/close cycles.
- **FR-008**: The preview MUST reflect the current in-memory editor content (including unsaved edits), not the last persisted file content.
- **FR-009**: The editor MUST remain interactive and the UI MUST remain responsive while rendering a preview, even for files exceeding 1,000 lines.
- **FR-010**: If the Markdown renderer encounters an error during preview generation, the pane MUST display a non-technical error message within the preview area and remain in Preview Mode; no silent fallback or crash is permitted.
- **FR-011**: When toggling from Preview Mode back to Edit Mode, the editor MUST restore the scroll position and cursor position that were active at the moment preview was activated.

### Key Entities

- **Editor Pane**: The Monaco-based code editing component in which files are opened and edited.
- **Preview Mode**: The read-only formatted Markdown rendering state that replaces the editor view.
- **Edit Mode**: The default Monaco editor state in which raw Markdown source is displayed and editable.
- **Toggle Control**: A button or icon in the pane header that switches the pane between Edit Mode and Preview Mode.
- **View State**: The current mode of the pane (edit or preview), persisted per-file within the session.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can switch between edit and preview modes in under 500 milliseconds for files under 500 lines.
- **SC-002**: All standard CommonMark elements render visually correctly in 100% of tested Markdown files (spec files, changelogs, READMEs).
- **SC-003**: Switching from preview back to edit mode preserves file content with zero character loss across 100 consecutive toggle cycles.
- **SC-004**: The toggle control is correctly shown for `.md` files and correctly absent for all other file types, with no false-positives or false-negatives observed during testing.
- **SC-005**: Previewing files up to 2,000 lines introduces no perceptible UI freeze — the editor remains interactive within 100 milliseconds of the toggle action completing.

---

## Clarifications

### Session 2026-06-21

- Q: Does the toggle require a dedicated keyboard shortcut (chord) in addition to the click button? → A: No dedicated chord. The button must be keyboard-focusable (Tab) and activatable via Enter/Space. A shortcut may be added in v2.
- Q: Should view state (edit vs. preview) persist when the file is closed and reopened within the same app session? → A: No — always reopen in Edit Mode. State is scoped to the open file instance only.
- Q: If the Markdown renderer throws an error during preview generation, what should happen? → A: Show a non-technical error message in the preview area; stay in Preview Mode so the developer can toggle back manually.
- Q: When toggling back from preview to Edit Mode, should the editor restore the scroll and cursor position? → A: Yes — restore both scroll position and cursor position to where they were before preview was activated.
- Q: Should fenced code blocks in the preview include syntax highlighting? → A: No — monospace block only for v1; syntax highlighting is deferred to v2.

---

## Assumptions

- The Monaco Editor pane's header area already accepts additional controls; no structural overhaul of the pane layout is required to accommodate the toggle.
- A Markdown rendering capability compatible with the existing frontend is available or can be introduced; the framework-first gate determines whether an existing dependency already covers this before any new library is added.
- The toggle operates on the live in-memory Monaco model content, not a separate file read — so it correctly reflects unsaved edits.
- Markdown files are identified solely by `.md` file extension; content-sniffing for Markdown syntax is out of scope for this release.
- The preview is read-only; a WYSIWYG split-edit/preview mode is out of scope for v1.
- HTML sanitisation is required because the Monaco editor pane runs in an Electron/web context where arbitrary HTML execution poses a security risk.
- Mobile or responsive layout considerations for the preview are out of scope; the pane exists in a desktop application.
