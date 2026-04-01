import { describe, it, expect } from 'vitest';
import { extractProjectFolder } from './projectFolder';

describe('extractProjectFolder', () => {
  it('returns project name from deep ProjectsWin path', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal\\internal\\terminal'))
      .toBe('forge-terminal');
  });

  it('returns project name from ProjectsWin root path', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\forge-terminal'))
      .toBe('forge-terminal');
  });

  it('returns project name with forward slashes', () => {
    expect(extractProjectFolder('C:/ProjectsWin/my-app/src/components'))
      .toBe('my-app');
  });

  it('is case-insensitive for ProjectsWin', () => {
    expect(extractProjectFolder('c:\\projectswin\\My-Project\\deep\\path'))
      .toBe('My-Project');
  });

  it('falls back to last segment for non-ProjectsWin paths', () => {
    expect(extractProjectFolder('/home/user/some-project/src'))
      .toBe('src');
  });

  it('returns null for empty or invalid input', () => {
    expect(extractProjectFolder('')).toBeNull();
    expect(extractProjectFolder(null)).toBeNull();
    expect(extractProjectFolder(undefined)).toBeNull();
  });

  it('handles path with only ProjectsWin (no child)', () => {
    expect(extractProjectFolder('C:\\ProjectsWin'))
      .toBe('ProjectsWin');
  });

  it('handles different projects under ProjectsWin', () => {
    expect(extractProjectFolder('C:\\ProjectsWin\\web-dashboard\\pages\\index'))
      .toBe('web-dashboard');
    expect(extractProjectFolder('C:\\ProjectsWin\\api-server\\cmd\\main'))
      .toBe('api-server');
  });
});
