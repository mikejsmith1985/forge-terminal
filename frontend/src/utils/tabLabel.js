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

// computeTabLabel derives a stable label from a working directory:
//  1. the project root (first child of a known projects container), else
//  2. the immediate folder name (FR-007 fallback when not under a projects root).
// The result is sanitized; an empty or missing path yields "Terminal".
export function computeTabLabel(cwd) {
  if (!cwd || typeof cwd !== 'string') return FALLBACK_LABEL

  let segments = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  if (segments.length > 1 && FILE_LIKE_SEGMENT.test(segments[segments.length - 1])) {
    segments = segments.slice(0, -1)
  }
  if (segments.length === 0) return FALLBACK_LABEL

  // Default to the immediate folder (FR-007). This is the explicit fallback —
  // not a guessed ancestor segment.
  let projectName = segments[segments.length - 1]

  // Prefer the project root when the path runs through a known projects container.
  for (let index = 0; index < segments.length - 1; index++) {
    if (KNOWN_PROJECT_ROOTS.has(segments[index].toLowerCase())) {
      projectName = segments[index + 1]
      break
    }
  }

  return stripNonPrintable(projectName) || FALLBACK_LABEL
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
