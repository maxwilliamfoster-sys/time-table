const CACHE = 'gcse-v2';
const pendingTimers = [];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./index.html', './manifest.json', './icon.svg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Only handle same-origin requests — let Firebase/Google CDN requests pass through untouched
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Network-first for HTML so updates are always picked up
  if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for other same-origin assets (manifest, icon, sw itself)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE_LESSONS') scheduleNotifications(e.data.lessons);
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

function scheduleNotifications(lessons) {
  pendingTimers.forEach(clearTimeout);
  pendingTimers.length = 0;
  const now = Date.now();
  lessons.forEach(lesson => {
    [15, 5, 0].forEach(minsBefore => {
      const fireAt = lesson.timestamp - minsBefore * 60000;
      const delay = fireAt - now;
      if (delay > 0 && delay < 14 * 3600000) {
        const t = setTimeout(() => {
          const title = minsBefore === 0
            ? `${lesson.subject} is starting now`
            : `${lesson.subject} in ${minsBefore} minute${minsBefore > 1 ? 's' : ''}`;
          const body = minsBefore === 0
            ? (lesson.isLesson ? 'Your online lesson is live' : 'Time to revise!')
            : `Starting at ${lesson.time} — get ready!`;
          self.registration.showNotification(title, {
            body,
            icon: './icon.svg',
            tag: `lesson-${lesson.id}-${minsBefore}`,
            requireInteraction: false,
          });
        }, delay);
        pendingTimers.push(t);
      }
    });
  });
}
