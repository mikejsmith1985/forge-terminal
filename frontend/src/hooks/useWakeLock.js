import { useState, useEffect, useCallback, useRef } from 'react';

export function useWakeLock(enabled = true) {
  const [isActive, setIsActive] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const requestLock = useCallback(async () => {
    if (!isSupported || !enabled) return false;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setIsActive(true);
      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false);
        wakeLockRef.current = null;
      });
      return true;
    } catch {
      setIsActive(false);
      return false;
    }
  }, [isSupported, enabled]);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setIsActive(false);
    }
  }, []);

  // Auto-request on mount when enabled, release on unmount
  useEffect(() => {
    if (enabled && isSupported) {
      requestLock();
    }
    return () => { releaseLock(); };
  }, [enabled, isSupported, requestLock, releaseLock]);

  // Re-acquire on visibility change (tab switch back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && enabled && isSupported) {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, isSupported, requestLock]);

  return { isActive, isSupported, requestLock, releaseLock };
}
