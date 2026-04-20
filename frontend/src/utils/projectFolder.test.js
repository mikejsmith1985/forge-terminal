import { describe, it, expect } from 'vitest';
import { extractProjectFolder, getTabTitle, isStaticNamingStrategy, getShellLabel } from './projectFolder';

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

  it('is case-insensitive for rootFolder', () => {
    expect(extractProjectFolder('c:\\projectswin\\My-Project\\deep\\path', 'ProjectsWin'))
      .toBe('My-Project');
  });

  it('falls back to second-level child of drive root when rootFolder not provided', () => {
    // Smarter fallback: for Windows drive paths returns parts[2] (project level)
    // rather than the deepest segment, keeping tab names stable on cd.
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal\\terminal'))
      .toBe('forge-terminal');
  });

  it('falls back to second-level child when rootFolder is empty string', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal\\terminal', ''))
      .toBe('forge-terminal');
  });

  it('falls back to third segment of Unix path when rootFolder not found', () => {
    // /home/user/some-project/src → parts[2] = 'some-project' (stable project name)
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

  it('handles path with only the rootFolder (no child)', () => {
    expect(extractProjectFolder('C:\\ProjectsWin', 'ProjectsWin'))
      .toBe('ProjectsWin');
  });

  it('handles different projects under rootFolder', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\web-dashboard\\pages\\index', 'ProjectsWin'))
      .toBe('web-dashboard');
    expect(extractProjectFolder('C:\\ProjectsWin\\api-server\\cmd\\main', 'ProjectsWin'))
      .toBe('api-server');
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
  const projPath = 'C:\\ProjectsWin\\forge-terminal\\src';
  const linuxPath = '/home/user/projects/myapp/components';

  it('project-root: pins to workspace root when rootFolder is provided', () => {
    expect(getTabTitle(projPath, 'project-root', { tabNumber: 1, rootFolder: 'ProjectsWin' })).toBe('forge-terminal');
  });

  it('project-root: falls back to second-level child of drive root when no rootFolder', () => {
    // projPath = 'C:\\ProjectsWin\\forge-terminal\\src' → parts[2] = 'forge-terminal'
    expect(getTabTitle(projPath, 'project-root', { tabNumber: 1 })).toBe('forge-terminal');
  });

  it('project-root: falls back to third Unix segment when rootFolder not found in path', () => {
    // linuxPath = '/home/user/projects/myapp/components' → parts[2] = 'projects'
    expect(getTabTitle(linuxPath, 'project-root', { tabNumber: 1, rootFolder: 'ProjectsWin' })).toBe('projects');
  });

  it('project-root: works with custom root folder names', () => {
    expect(getTabTitle('/home/user/repos/my-lib/src', 'project-root', { tabNumber: 1, rootFolder: 'repos' })).toBe('my-lib');
  });

  it('current-dir: returns deepest directory', () => {
    expect(getTabTitle(projPath, 'current-dir', { tabNumber: 1 })).toBe('src');
    expect(getTabTitle(linuxPath, 'current-dir', { tabNumber: 2 })).toBe('components');
  });

  it('parent-child: returns two segments', () => {
    expect(getTabTitle(projPath, 'parent-child', { tabNumber: 1 })).toBe('forge-terminal/src');
    expect(getTabTitle(linuxPath, 'parent-child', { tabNumber: 1 })).toBe('myapp/components');
  });

  it('shell-type: uses shell label + tab number', () => {
    expect(getTabTitle(null, 'shell-type', { tabNumber: 1, shellType: 'powershell' })).toBe('PowerShell 1');
    expect(getTabTitle(null, 'shell-type', { tabNumber: 3, shellType: 'wsl' })).toBe('WSL 3');
  });

  it('numbered: returns Terminal N', () => {
    expect(getTabTitle(projPath, 'numbered', { tabNumber: 2 })).toBe('Terminal 2');
    expect(getTabTitle(null, 'numbered', { tabNumber: 5 })).toBe('Terminal 5');
  });

  it('custom-prefix: uses prefix + tab number', () => {
    expect(getTabTitle(null, 'custom-prefix', { tabNumber: 1, prefix: 'Dev' })).toBe('Dev 1');
    expect(getTabTitle(projPath, 'custom-prefix', { tabNumber: 3, prefix: 'Prod' })).toBe('Prod 3');
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
