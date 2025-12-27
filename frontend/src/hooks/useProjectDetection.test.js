import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectDetection } from './useProjectDetection';

describe('useProjectDetection', () => {
  describe('initialization', () => {
    it('should return null for undefined directory', () => {
      const { result } = renderHook(() => useProjectDetection(undefined));

      expect(result.current).toBeNull();
    });

    it('should return null for null directory', () => {
      const { result } = renderHook(() => useProjectDetection(null));

      expect(result.current).toBeNull();
    });

    it('should return null for empty string', () => {
      const { result } = renderHook(() => useProjectDetection(''));

      expect(result.current).toBeNull();
    });
  });

  describe('project detection', () => {
    it('should extract project name from Unix path', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home/user/projects/forge-terminal')
      );

      expect(result.current).toBe('forge-terminal');
    });

    it('should extract project name from Windows path', () => {
      const { result } = renderHook(() => 
        useProjectDetection('C:\\ProjectsWin\\forge-terminal\\src')
      );

      expect(result.current).toBe('forge-terminal');
    });

    it('should handle path with "projects" directory', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/Users/mike/projects/my-app/frontend')
      );

      expect(result.current).toBe('my-app');
    });

    it('should handle path with "ProjectsWin" directory', () => {
      const { result } = renderHook(() => 
        useProjectDetection('C:\\ProjectsWin\\my-app\\backend')
      );

      expect(result.current).toBe('my-app');
    });

    it('should handle path with "workspace" directory', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home/dev/workspace/awesome-project')
      );

      expect(result.current).toBe('awesome-project');
    });

    it('should handle path with "repos" directory', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/Users/jane/repos/cool-app/src')
      );

      expect(result.current).toBe('cool-app');
    });

    it('should fallback to last directory name if no root indicator', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/some/random/path/myproject')
      );

      expect(result.current).toBe('myproject');
    });

    it('should handle path with trailing slash', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home/user/projects/forge-terminal/')
      );

      expect(result.current).toBe('forge-terminal');
    });

    it('should handle deeply nested path', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home/user/projects/forge-terminal/frontend/src/components/workflow')
      );

      expect(result.current).toBe('forge-terminal');
    });

    it('should handle path with multiple forward slashes', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home//user///projects////forge-terminal')
      );

      expect(result.current).toBe('forge-terminal');
    });

    it('should handle Windows UNC path', () => {
      const { result } = renderHook(() => 
        useProjectDetection('\\\\server\\share\\projects\\myapp')
      );

      expect(result.current).toBe('myapp');
    });

    it('should handle root directory', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/forge-terminal')
      );

      expect(result.current).toBe('forge-terminal');
    });

    it('should update when currentDirectory changes', () => {
      const { result, rerender } = renderHook(
        ({ dir }) => useProjectDetection(dir),
        { initialProps: { dir: '/home/user/projects/app1' } }
      );

      expect(result.current).toBe('app1');

      rerender({ dir: '/home/user/projects/app2' });

      expect(result.current).toBe('app2');
    });

    it('should handle mixed path separators', () => {
      const { result } = renderHook(() => 
        useProjectDetection('C:/ProjectsWin\\forge-terminal/src')
      );

      expect(result.current).toBe('forge-terminal');
    });
  });

  describe('edge cases', () => {
    it('should handle path with spaces in directory names', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home/user/My Projects/my app')
      );

      expect(result.current).toBe('my app');
    });

    it('should handle path with special characters', () => {
      const { result } = renderHook(() => 
        useProjectDetection('/home/user/projects/my-app_v2.0')
      );

      expect(result.current).toBe('my-app_v2.0');
    });

    it('should handle single directory', () => {
      const { result } = renderHook(() => 
        useProjectDetection('myproject')
      );

      expect(result.current).toBe('myproject');
    });
  });
});
