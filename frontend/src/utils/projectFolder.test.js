import { describe, it, expect } from 'vitest';
import { extractProjectFolder, getTabTitle, isStaticNamingStrategy, getShellLabel, isFileLikeName, isTempOrSystemPath } from './projectFolder';

// Tests for projectFolder.js -- the canonical source for tab title extraction logic.

describe('isFileLikeName', () => {
  it('identifies common web and document file extensions', () => {
    expect(isFileLikeName('index.html')).toBe(true);
    expect(isFileLikeName('styles.css')).toBe(true);
    expect(isFileLikeName('package.json')).toBe(true);
    expect(isFileLikeName('README.md')).toBe(true);
    expect(isFileLikeName('config.yaml')).toBe(true);
    expect(isFileLikeName('data.xml')).toBe(true);
    expect(isFileLikeName('favicon.ico')).toBe(true);
    expect(isFileLikeName('logo.png')).toBe(true);
    expect(isFileLikeName('build.lock')).toBe(true);
    expect(isFileLikeName('deploy.sh')).toBe(true);
    expect(isFileLikeName('setup.ps1')).toBe(true);
    expect(isFileLikeName('app.exe')).toBe(true);
  });

  it('does NOT flag language-extension directory names', () => {
    // Language extensions are intentionally excluded because they appear as
    // project folder names (e.g. a project directory called "node.js").
    expect(isFileLikeName('app.js')).toBe(false);
    expect(isFileLikeName('main.ts')).toBe(false);
    expect(isFileLikeName('handler.go')).toBe(false);
    expect(isFileLikeName('main.py')).toBe(false);
  });

  it('does NOT flag dotfiles that start with a single dot', () => {
    // .git, .env, .gitignore are directories or dotfiles -- not document files.
    expect(isFileLikeName('.git')).toBe(false);
    expect(isFileLikeName('.env')).toBe(false);
    expect(isFileLikeName('.gitignore')).toBe(false);
  });

  it('does NOT flag plain directory names with no extension', () => {
    expect(isFileLikeName('forge-terminal')).toBe(false);
    expect(isFileLikeName('src')).toBe(false);
    expect(isFileLikeName('components')).toBe(false);
    expect(isFileLikeName('RLL')).toBe(false);
  });

  it('returns false for empty, null, or non-string values', () => {
    expect(isFileLikeName('')).toBe(false);
    expect(isFileLikeName(null)).toBe(false);
    expect(isFileLikeName(undefined)).toBe(false);
  });
});

describe('extractProjectFolder', () => {
  it('returns project name from deep ProjectsWin path when rootFolder is provided', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal\\terminal', 'ProjectsWin'))
      .toBe('forge-terminal');
  });

  it('returns project name from ProjectsWin root path when rootFolder is provided', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal', 'ProjectsWin'))
      .toBe('forge-terminal');
  });

  it('returns project name with forward slashes when rootFolder is provided', () => {
    expect(extractProjectFolder('C:/ProjectsWin/my-app/src/components', 'ProjectsWin'))
      .toBe('my-app');
  });

  it('is case-insensitive for rootFolder matching', () => {
    expect(extractProjectFolder('c:\\projectswin\\My-Project\\deep\\path', 'ProjectsWin'))
      .toBe('My-Project');
  });

  it('falls back to auto-detected root when rootFolder not provided', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal\\terminal'))
      .toBe('forge-terminal');
  });

  it('falls back correctly when rootFolder is empty string', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal\\terminal', ''))
      .toBe('forge-terminal');
  });

  it('falls back to third segment of Unix path when rootFolder not found', () => {
    expect(extractProjectFolder('/home/user/some-project/src', 'ProjectsWin'))
      .toBe('some-project');
  });

  it('works with custom root folder names', () => {
    expect(extractProjectFolder('/home/user/repos/my-lib/src', 'repos'))
      .toBe('my-lib');
    expect(extractProjectFolder('C:\\workspace\\api-server\\cmd', 'workspace'))
      .toBe('api-server');
  });

  it('returns null for empty or invalid input', () => {
    expect(extractProjectFolder('')).toBeNull();
    expect(extractProjectFolder(null)).toBeNull();
    expect(extractProjectFolder(undefined)).toBeNull();
  });

  it('handles path with only the rootFolder and no child project', () => {
    expect(extractProjectFolder('C:\\ProjectsWin', 'ProjectsWin'))
      .toBe('ProjectsWin');
  });

  it('handles different projects under the same rootFolder', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\web-dashboard\\pages\\index', 'ProjectsWin'))
      .toBe('web-dashboard');
    expect(extractProjectFolder('C:\\ProjectsWin\\api-server\\cmd\\main', 'ProjectsWin'))
      .toBe('api-server');
  });

  it('strips a trailing HTML file and returns the correct project name', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\forge-companion\\index.html', 'ProjectsWin'))
      .toBe('forge-terminal');
  });

  it('strips a trailing JSON file from a Windows path', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\RLL\\package.json', 'ProjectsWin'))
      .toBe('RLL');
  });

  it('strips a trailing Markdown file from a Unix path', () => {
    expect(extractProjectFolder('/home/user/repos/myproject/README.md', 'repos'))
      .toBe('myproject');
  });

  it('strips a trailing CSS file and returns the parent directory', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\frontend\\styles.css', 'ProjectsWin'))
      .toBe('forge-terminal');
  });

  it('strips a file and auto-detects ProjectsWin when rootFolder is omitted', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\index.html'))
      .toBe('forge-terminal');
  });

  it('does NOT strip .git because it is a dotfile directory', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\.git', 'ProjectsWin'))
      .toBe('forge-terminal');
  });

  it('does NOT strip a plain directory with no extension', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal', 'ProjectsWin'))
      .toBe('forge-terminal');
  });

  it('auto-detects ProjectsWin in a Windows path without rootFolder config', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\my-project\\src\\components'))
      .toBe('my-project');
  });

  it('auto-detects repos in a Unix path without rootFolder config', () => {
    expect(extractProjectFolder('/home/user/repos/my-lib/src'))
      .toBe('my-lib');
  });

  it('auto-detects workspace in a path without rootFolder config', () => {
    expect(extractProjectFolder('C:\\workspace\\api-server\\cmd'))
      .toBe('api-server');
  });

  it('falls back to Windows parts[2] when no known root folder name is found', () => {
    // Without a configured rootFolder and no KNOWN_ROOT_FOLDER_NAMES in the path,
    // the code uses parts[2] (the third segment). For C:\Users\mikej\..., that is "mikej".
    // Users who want the correct project name here should configure rootFolder explicitly.
    expect(extractProjectFolder('C:\\Users\\mikej\\some-project\\src'))
      .toBe('mikej');
  });
});

describe('getShellLabel', () => {
  it('maps powershell to PowerShell', () => {
    expect(getShellLabel('powershell')).toBe('PowerShell');
    expect(getShellLabel('PowerShell')).toBe('PowerShell');
  });
  it('maps cmd to CMD', () => {
    expect(getShellLabel('cmd')).toBe('CMD');
  });
  it('maps wsl to WSL', () => {
    expect(getShellLabel('wsl')).toBe('WSL');
  });
  it('falls back to Terminal for unknown types', () => {
    expect(getShellLabel('bash')).toBe('Terminal');
    expect(getShellLabel('')).toBe('Terminal');
    expect(getShellLabel(undefined)).toBe('Terminal');
  });
});

describe('isStaticNamingStrategy', () => {
  it('returns true for static strategies', () => {
    expect(isStaticNamingStrategy('numbered')).toBe(true);
    expect(isStaticNamingStrategy('shell-type')).toBe(true);
    expect(isStaticNamingStrategy('custom-prefix')).toBe(true);
  });
  it('returns false for dynamic strategies', () => {
    expect(isStaticNamingStrategy('project-root')).toBe(false);
    expect(isStaticNamingStrategy('current-dir')).toBe(false);
    expect(isStaticNamingStrategy('parent-child')).toBe(false);
  });
});

describe('getTabTitle', () => {
  const windowsProjectPath = 'C:\\ProjectsWin\\forge-terminal\\src';
  const unixProjectPath = '/home/user/projects/myapp/components';

  it('project-root: pins to workspace root when rootFolder is provided', () => {
    expect(getTabTitle(windowsProjectPath, 'project-root', { tabNumber: 1, rootFolder: 'ProjectsWin' })).toBe('forge-terminal');
  });

  it('project-root: auto-detects root when no rootFolder configured', () => {
    expect(getTabTitle(windowsProjectPath, 'project-root', { tabNumber: 1 })).toBe('forge-terminal');
  });

  it('project-root: falls back to third Unix segment when rootFolder not found in path', () => {
    expect(getTabTitle(unixProjectPath, 'project-root', { tabNumber: 1, rootFolder: 'ProjectsWin' })).toBe('projects');
  });

  it('project-root: works with custom root folder names', () => {
    expect(getTabTitle('/home/user/repos/my-lib/src', 'project-root', { tabNumber: 1, rootFolder: 'repos' })).toBe('my-lib');
  });

  it('project-root: strips file suffix before extracting project name', () => {
    expect(getTabTitle('C:\\ProjectsWin\\RLL\\src\\index.html', 'project-root', { tabNumber: 1, rootFolder: 'ProjectsWin' })).toBe('RLL');
  });

  it('current-dir: returns deepest directory segment', () => {
    expect(getTabTitle(windowsProjectPath, 'current-dir', { tabNumber: 1 })).toBe('src');
    expect(getTabTitle(unixProjectPath, 'current-dir', { tabNumber: 2 })).toBe('components');
  });

  it('current-dir: strips file suffix and returns the parent directory', () => {
    expect(getTabTitle('C:\\ProjectsWin\\RLL\\index.html', 'current-dir', { tabNumber: 1 })).toBe('RLL');
  });

  it('parent-child: returns two directory segments joined with a slash', () => {
    expect(getTabTitle(windowsProjectPath, 'parent-child', { tabNumber: 1 })).toBe('forge-terminal/src');
    expect(getTabTitle(unixProjectPath, 'parent-child', { tabNumber: 1 })).toBe('myapp/components');
  });

  it('shell-type: uses shell label and tab number', () => {
    expect(getTabTitle(null, 'shell-type', { tabNumber: 1, shellType: 'powershell' })).toBe('PowerShell 1');
    expect(getTabTitle(null, 'shell-type', { tabNumber: 3, shellType: 'wsl' })).toBe('WSL 3');
  });

  it('numbered: returns Terminal N', () => {
    expect(getTabTitle(windowsProjectPath, 'numbered', { tabNumber: 2 })).toBe('Terminal 2');
    expect(getTabTitle(null, 'numbered', { tabNumber: 5 })).toBe('Terminal 5');
  });

  it('custom-prefix: uses prefix and tab number', () => {
    expect(getTabTitle(null, 'custom-prefix', { tabNumber: 1, prefix: 'Dev' })).toBe('Dev 1');
    expect(getTabTitle(windowsProjectPath, 'custom-prefix', { tabNumber: 3, prefix: 'Prod' })).toBe('Prod 3');
  });

  it('uses fallback when path is null for dynamic strategies', () => {
    expect(getTabTitle(null, 'current-dir', { tabNumber: 1, fallback: 'My Tab' })).toBe('My Tab');
    expect(getTabTitle(null, 'project-root', { tabNumber: 1, fallback: 'My Tab' })).toBe('My Tab');
  });

  it('defaults tab number to 1 when not provided', () => {
    expect(getTabTitle(null, 'numbered', {})).toBe('Terminal 1');
    expect(getTabTitle(null, 'custom-prefix', { prefix: 'X' })).toBe('X 1');
  });
});

describe('isTempOrSystemPath', () => {
  // Windows temp paths — the primary vector for this bug (pasted images land in %TEMP%)
  it('identifies Windows AppData\\Local\\Temp as a temp path', () => {
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\Local\\Temp')).toBe(true);
  });

  it('identifies a deep Windows temp path (e.g. pasted image subfolder)', () => {
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\Local\\Temp\\paste-12345')).toBe(true);
  });

  it('identifies Windows TEMP with forward slashes', () => {
    expect(isTempOrSystemPath('C:/Users/mikej/AppData/Local/Temp')).toBe(true);
  });

  it('identifies Windows AppData\\LocalLow as a system path', () => {
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\LocalLow\\SomeCache')).toBe(true);
  });

  it('identifies Windows system temp (C:\\Windows\\Temp)', () => {
    expect(isTempOrSystemPath('C:\\Windows\\Temp')).toBe(true);
    expect(isTempOrSystemPath('C:\\Windows\\Temp\\some-file')).toBe(true);
  });

  it('identifies ProgramData temp as a system path', () => {
    expect(isTempOrSystemPath('C:\\ProgramData\\Temp')).toBe(true);
  });

  // Unix/macOS temp paths
  it('identifies /tmp as a temp path', () => {
    expect(isTempOrSystemPath('/tmp')).toBe(true);
    expect(isTempOrSystemPath('/tmp/')).toBe(true);
    expect(isTempOrSystemPath('/tmp/forge-paste-abc123')).toBe(true);
  });

  it('identifies macOS /var/folders as a temp path', () => {
    expect(isTempOrSystemPath('/var/folders/xy/abc123/T/image.png')).toBe(true);
  });

  it('identifies macOS /private/var/folders as a temp path', () => {
    expect(isTempOrSystemPath('/private/var/folders/xy/abc123/T')).toBe(true);
  });

  it('identifies /var/tmp as a temp path', () => {
    expect(isTempOrSystemPath('/var/tmp/some-cache')).toBe(true);
  });

  // Project paths — must NOT be flagged
  it('does NOT flag a normal Windows project path', () => {
    expect(isTempOrSystemPath('C:\\ProjectsWin\\forge-terminal')).toBe(false);
    expect(isTempOrSystemPath('C:\\ProjectsWin\\forge-terminal\\src\\components')).toBe(false);
  });

  it('does NOT flag a Unix project path', () => {
    expect(isTempOrSystemPath('/home/user/repos/my-project')).toBe(false);
    expect(isTempOrSystemPath('/Users/mikej/projects/forge-terminal')).toBe(false);
  });

  it('does NOT flag a user home directory (not temp)', () => {
    // Navigating to ~/ is valid — only the Temp sub-path is blocked
    expect(isTempOrSystemPath('C:\\Users\\mikej')).toBe(false);
    expect(isTempOrSystemPath('/home/mikej')).toBe(false);
  });

  it('does NOT flag AppData\\Roaming (only Local\\Temp and LocalLow are blocked)', () => {
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\Roaming\\SomeApp')).toBe(false);
  });

  it('returns false for empty, null, or non-string values', () => {
    expect(isTempOrSystemPath('')).toBe(false);
    expect(isTempOrSystemPath(null)).toBe(false);
    expect(isTempOrSystemPath(undefined)).toBe(false);
  });
});

// ── Image paste / clipboard path contract ──────────────────────────────────
// These tests document the contract that ForgeTerminal's OSC 9;9 handler must
// honour: pasted images saved to %TEMP% must never cause a tab rename.
// The handler uses isFileLikeName() + isTempOrSystemPath() together as its
// guard — so both utilities must handle the clipboard image scenario correctly.

describe('isFileLikeName – image paste scenario', () => {
  it('identifies timestamped clipboard image filenames as files, not directories', () => {
    // Forge Terminal stores pasted images as clipboard-<timestamp>.<ext> in %TEMP%.
    // extractProjectFolder() strips the file segment but returns the username
    // ("mikej") as the project folder via the Windows parts[2] heuristic.
    // isFileLikeName() must flag the raw filename BEFORE extractProjectFolder
    // is called so the OSC 9;9 guard can short-circuit without ever firing the
    // tab-rename callback.
    expect(isFileLikeName('clipboard-1777811581166059900.png')).toBe(true);
    expect(isFileLikeName('clipboard-abc123.jpg')).toBe(true);
    expect(isFileLikeName('screenshot-2024.webp')).toBe(true);
    expect(isFileLikeName('frame-001.gif')).toBe(true);
    expect(isFileLikeName('screenshot.bmp')).toBe(true);
    expect(isFileLikeName('capture.ico')).toBe(true);
    expect(isFileLikeName('photo.jpeg')).toBe(true);
  });
});

describe('isTempOrSystemPath – image paste scenario', () => {
  it('blocks the full clipboard image path (file extension included in the path)', () => {
    // Some AI tools emit OSC 9;9 with the file path rather than just the parent
    // directory.  The path still contains /appdata/local/temp so it must be blocked.
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\Local\\Temp\\clipboard-1777811581166059900.png')).toBe(true);
    expect(isTempOrSystemPath('C:/Users/mikej/AppData/Local/Temp/screenshot.png')).toBe(true);
  });

  it('blocks the Windows temp directory at any sub-path depth', () => {
    // AI agents processing a pasted image may cd to %TEMP% and emit OSC 9;9.
    // Every sub-path under %TEMP% must be blocked so the tab keeps its project name.
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\Local\\Temp')).toBe(true);
    expect(isTempOrSystemPath('C:\\Users\\mikej\\AppData\\Local\\Temp\\subfolder')).toBe(true);
  });
});

// ── isStaticNamingStrategy ──────────────────────────────────────────────────

describe('isStaticNamingStrategy', () => {
  // Static strategies produce a title once at creation (e.g. "Terminal 3") and
  // never update it when the user changes directories.  This set must stay in
  // sync with the static-naming branch in useTabManager's createTabAction.

  it('returns true for numbered strategy', () => {
    expect(isStaticNamingStrategy('numbered')).toBe(true);
  });

  it('returns true for shell-type strategy', () => {
    expect(isStaticNamingStrategy('shell-type')).toBe(true);
  });

  it('returns true for custom-prefix strategy', () => {
    expect(isStaticNamingStrategy('custom-prefix')).toBe(true);
  });

  it('returns false for dynamic strategies', () => {
    expect(isStaticNamingStrategy('project-root')).toBe(false);
    expect(isStaticNamingStrategy('current-dir')).toBe(false);
    expect(isStaticNamingStrategy('parent-child')).toBe(false);
  });

  it('returns false for unknown or empty values', () => {
    expect(isStaticNamingStrategy('')).toBe(false);
    expect(isStaticNamingStrategy(null)).toBe(false);
    expect(isStaticNamingStrategy(undefined)).toBe(false);
    expect(isStaticNamingStrategy('random-string')).toBe(false);
  });
});

// ── Tab number collision helpers ────────────────────────────────────────────
// Tests for the max-number logic used by useTabManager.createTabAction to
// prevent duplicate tab titles after a tab is closed.
//
// The formula used is:
//   Math.max(0, ...tabs.map(t => parseInt(t.title?.match(/\d+$/)?.[0] || '0', 10))) + 1
//
// We exercise this formula directly here since it is a pure computation
// that doesn't require mounting React hooks.

describe('next tab number computation (static strategy)', () => {
  /**
   * Mirrors the formula in useTabManager.createTabAction so that the test
   * acts as a regression guard for the max-number logic.
   * @param {Array<{title: string}>} tabs
   * @returns {number}
   */
  function computeNextTabNumber(tabs) {
    return Math.max(0, ...tabs.map(tab => parseInt(tab.title?.match(/\d+$/)?.[0] || '0', 10))) + 1;
  }

  it('starts at 1 when there are no existing tabs', () => {
    expect(computeNextTabNumber([])).toBe(1);
  });

  it('increments beyond the highest tab number in a contiguous list', () => {
    const tabs = [{ title: 'Terminal 1' }, { title: 'Terminal 2' }, { title: 'Terminal 3' }];
    expect(computeNextTabNumber(tabs)).toBe(4);
  });

  it('uses max+1 to skip gaps left by closed tabs', () => {
    // Closing "Terminal 2" leaves a gap — next should be 4, not 3 (which would duplicate)
    const tabs = [{ title: 'Terminal 1' }, { title: 'Terminal 3' }];
    expect(computeNextTabNumber(tabs)).toBe(4);
  });

  it('works correctly for shell-type titles (e.g. "PowerShell 2")', () => {
    const tabs = [{ title: 'PowerShell 1' }, { title: 'PowerShell 3' }];
    expect(computeNextTabNumber(tabs)).toBe(4);
  });

  it('works correctly for custom-prefix titles (e.g. "Dev 5")', () => {
    const tabs = [{ title: 'Dev 2' }, { title: 'Dev 5' }];
    expect(computeNextTabNumber(tabs)).toBe(6);
  });

  it('handles tabs with no trailing number gracefully (treats them as 0)', () => {
    const tabs = [{ title: 'forge-terminal' }, { title: 'Terminal 2' }];
    expect(computeNextTabNumber(tabs)).toBe(3);
  });

  it('handles undefined or null titles without throwing', () => {
    const tabs = [{ title: null }, { title: undefined }, { title: 'Terminal 1' }];
    expect(computeNextTabNumber(tabs)).toBe(2);
  });
});

