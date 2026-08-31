// tabLabel.js — the single source of a terminal tab's display name.
//
// Tab naming rebuild: a tab's label is computed ONCE at creation from the tab's
// initial working directory and is never recomputed from terminal output. This
// module holds the only two functions that ever produce a label, so there is
// exactly one place naming can happen — which is what stops the label from
// drifting (or getting corrupted) as an agent navigates deeper into a project.

// Container folders whose first child is the project root. Matched case-insensitively.
// If a path runs through one of these, the segment right after it is the project name.
const KNOWN_PROJECT_ROOTS = new Set(['projectswin', 'projects', 'repos', 'workspace', 'workspaces'])

// Used when no directory is available at all.
const FALLBACK_LABEL = 'Terminal'

// A trailing path segment that looks like a file (has a short extension) is not a
// folder name, so it is dropped before resolving the project name.
const FILE_LIKE_SEGMENT = /\.[a-z0-9]{1,8}$/i

// Remove ASCII control characters (0–31 and 127) and trim — defense-in-depth so a
// corrupted path carrying raw escape-sequence bytes can never reach the tab label.
function stripNonPrintable(value) {
  let result = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code > 31 && code !== 127) {
      result += character
    }
  }
  return result.trim()
}

// pathToSegments splits a Windows or POSIX path into folder segments, dropping a
// trailing file-like segment so a file path resolves to its containing folder.
function pathToSegments(cwd) {
  let segments = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  if (segments.length > 1 && FILE_LIKE_SEGMENT.test(segments[segments.length - 1])) {
    segments = segments.slice(0, -1)
  }
  return segments
}

// resolveProjectRoot returns the project-root folder name ONLY when the path runs
// through a known projects container (e.g. .../ProjectsWin/<root>/...), sanitized.
// It returns null for anything else — temp dirs, home dirs, or any path not anchored
// to a recognised container. This strictness is deliberate: it is what lets a tab
// relabel on a genuine project switch (see shouldRelabelForDirectory) while staying
// frozen during deep navigation and temp detours, so the old title-drift bug cannot
// return. Note: this is stricter than computeTabLabel, which adds an FR-007 fallback.
export function resolveProjectRoot(cwd) {
  if (!cwd || typeof cwd !== 'string') return null

  const segments = pathToSegments(cwd)
  for (let index = 0; index < segments.length - 1; index++) {
    if (KNOWN_PROJECT_ROOTS.has(segments[index].toLowerCase())) {
      return stripNonPrintable(segments[index + 1]) || null
    }
  }
  return null
}

// computeTabLabel derives a stable label from a working directory:
//  1. the project root (first child of a known projects container), else
//  2. the immediate folder name (FR-007 fallback when not under a projects root).
// The result is sanitized; an empty or missing path yields "Terminal".
export function computeTabLabel(cwd) {
  if (!cwd || typeof cwd !== 'string') return FALLBACK_LABEL

  // Prefer the project root when the path runs through a known projects container.
  const projectRoot = resolveProjectRoot(cwd)
  if (projectRoot) return projectRoot

  // FR-007 fallback: the immediate folder name. This is the explicit fallback —
  // not a guessed ancestor segment.
  const segments = pathToSegments(cwd)
  if (segments.length === 0) return FALLBACK_LABEL
  return stripNonPrintable(segments[segments.length - 1]) || FALLBACK_LABEL
}

// shouldRelabelForDirectory decides whether a tab's label should change after the
// shell moves from oldCwd to newCwd. It returns the NEW project-root label to apply,
// or null to keep the existing label. A relabel happens ONLY on a genuine project
// switch: newCwd must resolve through a known projects container, and to a different
// root than oldCwd did. Deep navigation within one project and detours into temp or
// home directories both return null — which is precisely why reopening this cwd→title
// path does not reopen the title-drift bug the tab-naming rebuild closed.
export function shouldRelabelForDirectory(oldCwd, newCwd) {
  const newRoot = resolveProjectRoot(newCwd)
  if (!newRoot) return null
  if (newRoot === resolveProjectRoot(oldCwd)) return null
  return newRoot
}

// dedupeLabel returns label unchanged if no open tab already uses it, otherwise
// appends the lowest free " #N" suffix (first duplicate becomes " #2").
export function dedupeLabel(label, existingLabels) {
  const taken = new Set(existingLabels || [])
  if (!taken.has(label)) return label

  let suffix = 2
  while (taken.has(`${label} #${suffix}`)) {
    suffix++
  }
  return `${label} #${suffix}`
}
