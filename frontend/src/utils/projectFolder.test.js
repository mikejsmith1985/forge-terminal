import { describe, it, expect } from 'vitest';
import { extractProjectFolder, getTabTitle, isStaticNamingStrategy, getShellLabel, isFileLikeName } from './projectFolder';

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
