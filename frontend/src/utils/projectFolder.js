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

/**
 * Return a human-friendly label for a shell type string.
 *
 * @param {string} shellType - e.g. 'powershell', 'cmd', 'wsl'
 * @returns {string}
 */
export function getShellLabel(shellType) {
  switch ((shellType || '').toLowerCase()) {
    case 'powershell': return 'PowerShell';
    case 'cmd':        return 'CMD';
    case 'wsl':        return 'WSL';
    default:           return 'Terminal';
  }
}

/**
 * Returns true for strategies whose tab title is set once at creation and
 * should NOT be auto-updated when the user changes directory.
 *
 * @param {string} strategy
 * @returns {boolean}
 */
export function isStaticNamingStrategy(strategy) {
  return strategy === 'shell-type' || strategy === 'numbered' || strategy === 'custom-prefix';
}

/**
 * Derive a tab title from a filesystem path using the requested naming strategy.
 *
 * Strategies:
 *  - "project-root"  : pin to workspace root (first child of ProjectsWin) — default
 *  - "current-dir"   : deepest segment of the path, updates on every cd
 *  - "parent-child"  : last two path segments, e.g. "workspace/src"
 *  - "shell-type"    : "<ShellLabel> <tabNumber>", e.g. "PowerShell 1" (static)
 *  - "numbered"      : "Terminal <tabNumber>" (static)
 *  - "custom-prefix" : "<prefix> <tabNumber>", e.g. "Dev 1" (static)
 *
 * @param {string|null} rawPath      - Current filesystem path (may be null on initial creation).
 * @param {string}      strategy     - One of the strategy names listed above.
 * @param {Object}      [opts]
 * @param {number}      [opts.tabNumber=1]   - Used by numbered/shell-type/custom-prefix strategies.
 * @param {string}      [opts.shellType]     - Shell identifier (used by shell-type strategy).
 * @param {string}      [opts.prefix='Dev']  - Custom prefix string.
 * @param {string}      [opts.fallback]      - Value to return when the path yields nothing useful.
 * @returns {string|null}
 */
export function getTabTitle(rawPath, strategy, opts = {}) {
  const { tabNumber = 1, shellType, prefix = 'Dev', fallback } = opts;
  const defaultFallback = fallback || `Terminal ${tabNumber}`;

  switch (strategy) {
    case 'current-dir': {
      if (!rawPath) return defaultFallback;
      const parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
      return parts[parts.length - 1] || defaultFallback;
    }

    case 'parent-child': {
      if (!rawPath) return defaultFallback;
      const parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
      }
      return parts[parts.length - 1] || defaultFallback;
    }

    case 'shell-type':
      return `${getShellLabel(shellType)} ${tabNumber}`;

    case 'numbered':
      return `Terminal ${tabNumber}`;

    case 'custom-prefix':
      return `${prefix || 'Dev'} ${tabNumber}`;

    // "project-root" is the default
    default:
      return extractProjectFolder(rawPath) || defaultFallback;
  }
}
