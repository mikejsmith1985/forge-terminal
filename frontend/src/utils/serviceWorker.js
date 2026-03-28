export function registerSW() {
  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[Forge] Service worker registered:', reg.scope);
        return reg;
      })
      .catch(err => {
        console.warn('[Forge] Service worker registration failed:', err);
        return null;
      });
  }
  return Promise.resolve(null);
}

export function unregisterSW() {
  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker.getRegistrations().then(registrations => {
      return Promise.all(registrations.map(r => r.unregister()));
    });
  }
  return Promise.resolve([]);
}
