// File extensions that unambiguously identify a path segment as a FILE rather
// than a directory. Language extensions (.js, .ts, .py, .go, etc.) are
// intentionally excluded because they can appear as project directory names
// (e.g. the folder "node.js" or a project named "create-react-app.ts").
const KNOWN_DOCUMENT_FILE_EXTENSIONS = /\.(html?|css|json|md|markdown|txt|xml|ya?ml|toml|ini|cfg|env|log|csv|sql|pdf|zip|tar|gz|bz2|7z|rar|png|jpe?g|gif|ico|svg|webp|bmp|ps1|bat|exe|msi|dll|so|dylib|lock|sh|cmd)$/i;

// Narrow set of common project-collection folder names.
// Intentionally kept small — generic names like "code", "dev", "work" are
// also common INSIDE projects, so anchoring on them causes false positives.
const KNOWN_ROOT_FOLDER_NAMES = new Set(['projectswin', 'repos', 'workspace', 'workspaces']);

/**
 * Returns true if the segment looks like a document, web, image, archive,
 * or binary file — NOT a directory and NOT a source code file.
 *
 * Use this to guard against file paths leaking into tab titles.
 * Exported so all callers can share one consistent definition.
 *
 * @param {string} segment - A single path component (no slashes).
 * @returns {boolean}
 */
export function isFileLikeName(segment) {
  if (!segment || typeof segment !== 'string') return false;
  // Dotfiles (.git, .env, .gitignore) are directories/config files, not "files" in this sense.
  if (segment.startsWith('.') && !segment.slice(1).includes('.')) return false;
  return KNOWN_DOCUMENT_FILE_EXTENSIONS.test(segment);
}

/**
 * Extract the project-level folder name from a path.
 *
 * Looks for a user-configured root folder name anywhere in the path and
 * returns its first child (the project name). This keeps tab names pinned
 * to the workspace-root level instead of changing with every `cd`.
 *
 * Automatically strips a trailing file segment (e.g. "index.html") before
 * extraction so that tools which report the file being edited — rather than
 * the containing directory — still produce a correct project-level name.
 *
 * Resolution order:
 *  1. Explicitly configured rootFolder (highest priority)
 *  2. Auto-detected known root folder name in the path (ProjectsWin, repos, …)
 *  3. Third path segment for Windows drive paths (C:\X\project\…)
 *  4. Third path segment for Unix absolute paths (/home/user/project/…)
 *  5. Last segment as final fallback
 *
 * @param {string}  rawPath    - A filesystem path (backslashes or forward slashes).
 * @param {string}  [rootFolder] - Name of the projects root directory to anchor on
 *                                 (e.g. "ProjectsWin", "repos"). Case-insensitive.
 *                                 Auto-detected from KNOWN_ROOT_FOLDER_NAMES when omitted.
 * @returns {string|null} The folder name to use as a tab title, or null if
 *   the path is empty / unparseable.
 */
export function extractProjectFolder(rawPath, rootFolder) {
  if (!rawPath || typeof rawPath !== 'string') return null;

  let parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return null;

  // Strip a trailing file segment so that a path like
  // "C:/ProjectsWin/forge-terminal/forge-companion/index.html" is treated
  // as if it were "C:/ProjectsWin/forge-terminal/forge-companion".
  // We only strip when there is a parent directory left to anchor on.
  if (parts.length > 1 && isFileLikeName(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
    if (parts.length === 0) return null;
  }

  // 1. Explicitly configured root folder takes highest priority.
  if (rootFolder && rootFolder.trim()) {
    const needle = rootFolder.trim().toLowerCase();
    const idx = parts.findIndex(p => p.toLowerCase() === needle);
    if (idx >= 0 && idx + 1 < parts.length) {
      return parts[idx + 1];
    }
  }

  // 2. Auto-detect from the narrow set of known root folder names.
  //    Only search the first half of the path to avoid anchoring inside a project.
  const searchLimit = Math.ceil(parts.length / 2);
  for (let i = 0; i < searchLimit; i++) {
    if (KNOWN_ROOT_FOLDER_NAMES.has(parts[i].toLowerCase()) && i + 1 < parts.length) {
      return parts[i + 1];
    }
  }

  // 3. Windows drive-rooted path: C:\ProjectsWin\forge-terminal\…
  const isDrivePath = /^[a-zA-Z]:$/.test(parts[0]);
  const isUnixAbsolute = rawPath.startsWith('/');

  if (isDrivePath && parts.length >= 3) {
    // C: / something / project / ... → return "project" (parts[2])
    return parts[2];
  }

  // 4. Unix absolute path: /home/user/project/…
  if (isUnixAbsolute && parts.length >= 3) {
    return parts[2];
  }
  if (isUnixAbsolute && parts.length >= 2) {
    return parts[1];
  }

  // 5. Last resort: deepest segment
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
 * Returns true if the given path is a system or temporary directory that
 * should never overwrite an established tab project root.
 *
 * Covers common Windows and Unix temp locations. Users with non-standard
 * temp dirs (e.g. D:\Temp) may not be covered; they can work around this
 * by setting a rootFolder in Tab Controls so the project-root strategy
 * anchors correctly.
 *
 * @param {string} rawPath - A filesystem path (backslashes or forward slashes).
 * @returns {boolean}
 */
export function isTempOrSystemPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return false;
  const normalized = rawPath.replace(/\\/g, '/').toLowerCase();
  return (
    // Windows: C:\Users\<user>\AppData\Local\Temp (standard %TEMP%)
    normalized.includes('/appdata/local/temp') ||
    // Windows: C:\Users\<user>\AppData\LocalLow (browser/app cache area)
    normalized.includes('/appdata/locallow') ||
    // Windows: C:\Windows\Temp (system-wide temp)
    normalized.includes('/windows/temp') ||
    // Windows: C:\ProgramData\Temp
    normalized.includes('/programdata/temp') ||
    // Unix/macOS: /tmp (standard temp mount, exact match or subpath)
    normalized === '/tmp' ||
    normalized.startsWith('/tmp/') ||
    // macOS: /var/folders (NSTemporaryDirectory / Gatekeeper quarantine)
    normalized.includes('/var/folders/') ||
    // macOS: /private/var/folders (real path backing the /var/folders symlink)
    normalized.includes('/private/var/folders/') ||
    // Linux: /var/tmp (temp area that survives reboots)
    normalized.includes('/var/tmp/')
  );
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
 *  - "project-root"  : pin to workspace root (first child of the configured root folder) — default
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
 * @param {string}      [opts.rootFolder]    - Projects root folder name for "project-root" strategy.
 * @param {string}      [opts.fallback]      - Value to return when the path yields nothing useful.
 * @returns {string|null}
 */
export function getTabTitle(rawPath, strategy, opts = {}) {
  const { tabNumber = 1, shellType, prefix = 'Dev', rootFolder, fallback } = opts;
  const defaultFallback = fallback || `Terminal ${tabNumber}`;

  switch (strategy) {
    case 'current-dir': {
      if (!rawPath) return defaultFallback;
      let parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
      // Strip a trailing file segment to avoid returning "index.html" as the directory name.
      if (parts.length > 1 && isFileLikeName(parts[parts.length - 1])) {
        parts = parts.slice(0, -1);
      }
      return parts[parts.length - 1] || defaultFallback;
    }

    case 'parent-child': {
      if (!rawPath) return defaultFallback;
      let parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
      // Strip a trailing file segment so the pair shows two directory names.
      if (parts.length > 1 && isFileLikeName(parts[parts.length - 1])) {
        parts = parts.slice(0, -1);
      }
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
      return extractProjectFolder(rawPath, rootFolder) || defaultFallback;
  }
}
