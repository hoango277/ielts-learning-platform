/* Service worker của IELTS Learn: nhận thông báo đẩy (Web Push) và mở đúng trang khi bấm vào thông báo.
 * Không cache dữ liệu — app cần mạng để phát video và dịch. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'IELTS Learn', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'ielts-learn',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'open-url', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
