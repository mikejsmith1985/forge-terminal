import { useState, useCallback, useRef } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [isSupported] = useState(typeof Notification !== 'undefined');
  const lastNotificationRef = useRef(null);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return 'denied';
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      return 'denied';
    }
  }, [isSupported]);

  const notify = useCallback((title, options = {}) => {
    if (!isSupported || permission !== 'granted') return null;
    if (document.visibilityState === 'visible') return null;

    try {
      const notification = new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        ...options,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        if (options.onClick) options.onClick();
      };

      lastNotificationRef.current = notification;
      return notification;
    } catch {
      return null;
    }
  }, [isSupported, permission]);

  const notifyCommandComplete = useCallback((command, exitCode) => {
    const title = exitCode === 0 ? '✅ Command Complete' : '❌ Command Failed';
    const body = command ? `${command} (exit ${exitCode})` : `Exit code: ${exitCode}`;
    return notify(title, { body, tag: 'forge-command' });
  }, [notify]);

  return { permission, isSupported, requestPermission, notify, notifyCommandComplete };
}
