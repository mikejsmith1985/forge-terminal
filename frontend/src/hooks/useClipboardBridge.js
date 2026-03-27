import { useState, useCallback } from 'react';

export function useClipboardBridge(ws) {
  const [serverClipboard, setServerClipboard] = useState('');

  const send = useCallback((data) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }, [ws]);

  const copyToServer = useCallback((content) => {
    send({ type: 'CLIPBOARD_WRITE', content });
  }, [send]);

  const requestFromServer = useCallback(() => {
    send({ type: 'CLIPBOARD_READ' });
  }, [send]);

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'CLIPBOARD_CONTENT') {
      setServerClipboard(msg.content || '');
    }
  }, []);

  return { serverClipboard, copyToServer, requestFromServer, handleMessage };
}
