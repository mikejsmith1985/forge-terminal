import { useState, useEffect, useCallback, useRef } from 'react';

export function useHostedMode(isOpen) {
  const [status, setStatus] = useState({
    running: false,
    tunnelURL: '',
    accessURL: '',
    token: '',
    qrCodeBase64: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/hosted/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (_) { /* ignore during polling */ }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      clearInterval(pollRef.current);
      return;
    }
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, [isOpen, fetchStatus]);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hosted/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setStatus(data);
      else setError(data.error || 'Failed to start');
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hosted/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, error, start, stop };
}
