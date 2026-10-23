// Service worker for the mobile bench (V3, #4): shows the test push and notes when it arrived,
// so the page can show the delay after the person comes back. Nothing else is cached or stored.
self.addEventListener('push', e => {
  const at = Date.now();
  e.waitUntil(Promise.all([
    self.registration.showNotification('ARC 테스트 알림', { body: `받은 시각 ${new Date(at).toTimeString().slice(0, 8)}`, tag: 'arc-bench' }),
    new Promise(res => {
      const r = indexedDB.open('arc-bench', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(at, 'pushAt'); tx.oncomplete = tx.onerror = res; };
      r.onerror = res;
    }),
  ]));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list[0]?.focus() ?? self.clients.openWindow('bench.html')));
});
