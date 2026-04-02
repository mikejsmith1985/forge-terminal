import { useState, useCallback } from 'react';

const LS_STRATEGY = 'forge:tabNamingStrategy';
const LS_PREFIX   = 'forge:tabNamingPrefix';

/**
 * useTabNaming – lightweight hook that surfaces the user's preferred tab
 * naming strategy and custom prefix, backed by localStorage for instant
 * synchronous reads across the app.
 *
 * The canonical source of truth is the server (tab-defaults.json), which
 * TabControlsPanel reads/writes via /api/tab-defaults. This hook mirrors
 * that value in localStorage so handleDirectoryChange and createTab can
 * read it without an async round-trip.
 */
export function useTabNaming() {
  const [namingStrategy, setNamingStrategyState] = useState(
    () => localStorage.getItem(LS_STRATEGY) || 'project-root'
  );
  const [namingPrefix, setNamingPrefixState] = useState(
    () => localStorage.getItem(LS_PREFIX) || 'Dev'
  );

  const setNamingStrategy = useCallback((strategy) => {
    setNamingStrategyState(strategy);
    localStorage.setItem(LS_STRATEGY, strategy);
  }, []);

  const setNamingPrefix = useCallback((prefix) => {
    setNamingPrefixState(prefix);
    localStorage.setItem(LS_PREFIX, prefix);
  }, []);

  return { namingStrategy, namingPrefix, setNamingStrategy, setNamingPrefix };
}
