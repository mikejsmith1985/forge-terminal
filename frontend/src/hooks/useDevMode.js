import { useState, useEffect } from 'react';

/**
 * Custom hook for managing DevMode state
 * Persists to localStorage for convenience during development
 * DevMode hides/shows features under development
 */
export function useDevMode() {
  const [devMode, setDevModeState] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    try {
      const storedValue = localStorage.getItem('devMode');
      const isEnabled = storedValue === 'true';
      setDevModeState(isEnabled);
      setIsInitialized(true);
    } catch (err) {
      console.error('[DevMode] Failed to read from localStorage:', err);
      setIsInitialized(true);
    }
  }, []);

  // Set DevMode and persist to localStorage
  const setDevMode = (enabled) => {
    try {
      if (typeof enabled !== 'boolean') {
        throw new Error('DevMode must be a boolean value');
      }
      
      setDevModeState(enabled);
      localStorage.setItem('devMode', enabled.toString());
    } catch (err) {
      console.error('[DevMode] Failed to set DevMode:', err);
      // State update still happens even if storage fails
      setDevModeState(enabled);
    }
  };

  // Toggle DevMode
  const toggleDevMode = () => {
    setDevMode(!devMode);
  };

  return {
    devMode,
    setDevMode,
    toggleDevMode,
    isInitialized
  };
}
