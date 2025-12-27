import { useState, useEffect } from 'react';

/**
 * Hook to detect project name from current directory path
 * @param {string} currentDirectory - Current working directory path
 * @returns {string|null} Detected project name or null
 */
export function useProjectDetection(currentDirectory) {
  const [projectName, setProjectName] = useState(null);

  useEffect(() => {
    if (!currentDirectory || currentDirectory === '') {
      setProjectName(null);
      return;
    }

    // Normalize path separators to forward slashes
    const normalizedPath = currentDirectory.replace(/\\/g, '/');

    // Split path and filter out empty parts (handles multiple slashes)
    const parts = normalizedPath.split('/').filter(p => p.length > 0);

    if (parts.length === 0) {
      setProjectName(null);
      return;
    }

    // Look for common project root indicators
    const rootIndicators = ['projects', 'ProjectsWin', 'workspace', 'repos'];
    let projectRootIndex = -1;

    for (let i = 0; i < parts.length; i++) {
      if (rootIndicators.includes(parts[i])) {
        projectRootIndex = i;
        break;
      }
    }

    // If found a root indicator, next directory is the project
    if (projectRootIndex !== -1 && projectRootIndex < parts.length - 1) {
      setProjectName(parts[projectRootIndex + 1]);
    } else {
      // Fallback: Use last directory name
      setProjectName(parts[parts.length - 1]);
    }
  }, [currentDirectory]);

  return projectName;
}
