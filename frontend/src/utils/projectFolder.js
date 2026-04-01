/**
 * Extract the project-level folder name from a path.
 *
 * For paths under C:\ProjectsWin\<project>\..., always returns <project>
 * regardless of how deep the current directory is. This keeps tab names
 * pinned to the workspace-root level instead of changing with every `cd`.
 *
 * For paths outside ProjectsWin, falls back to the deepest segment.
 *
 * @param {string} rawPath - A filesystem path (backslashes or forward slashes).
 * @returns {string|null} The folder name to use as a tab title, or null if
 *   the path is empty / unparseable.
 */
export function extractProjectFolder(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;

  const parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return null;

  // Pin to the first child of any "ProjectsWin" ancestor
  const pwIdx = parts.findIndex(p => p.toLowerCase() === 'projectswin');
  if (pwIdx >= 0 && pwIdx + 1 < parts.length) {
    return parts[pwIdx + 1];
  }

  // Fallback: deepest segment (previous default behaviour)
  return parts[parts.length - 1];
}
