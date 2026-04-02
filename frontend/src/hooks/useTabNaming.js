import { useState, useCallback } from 'react';

const LS_STRATEGY    = 'forge:tabNamingStrategy';
const LS_PREFIX      = 'forge:tabNamingPrefix';
const LS_ROOT_FOLDER = 'forge:tabNamingRootFolder';

/**
 * useTabNaming – lightweight hook that surfaces the user's preferred tab
 * naming strategy, custom prefix, and projects root folder name, backed by
 * localStorage for instant synchronous reads across the app.
 *
 * The canonical source of truth is the server (tab-defaults.json), which
 * TabControlsPanel reads/writes via /api/tab-defaults. This hook mirrors
 * those values in localStorage so handleDirectoryChange and createTab can
 * read them without an async round-trip.
 */
export function useTabNaming() {
  const [namingStrategy, setNamingStrategyState] = useState(
    () => localStorage.getItem(LS_STRATEGY) || 'project-root'
  );
  const [namingPrefix, setNamingPrefixState] = useState(
    () => localStorage.getItem(LS_PREFIX) || 'Dev'
  );
  const [namingRootFolder, setNamingRootFolderState] = useState(
    () => localStorage.getItem(LS_ROOT_FOLDER) || ''
  );

  const setNamingStrategy = useCallback((strategy) => {
    setNamingStrategyState(strategy);
    localStorage.setItem(LS_STRATEGY, strategy);
  }, []);

  const setNamingPrefix = useCallback((prefix) => {
    setNamingPrefixState(prefix);
    localStorage.setItem(LS_PREFIX, prefix);
  }, []);

  const setNamingRootFolder = useCallback((rootFolder) => {
    setNamingRootFolderState(rootFolder);
    localStorage.setItem(LS_ROOT_FOLDER, rootFolder);
  }, []);

  return { namingStrategy, namingPrefix, namingRootFolder, setNamingStrategy, setNamingPrefix, setNamingRootFolder };
}
