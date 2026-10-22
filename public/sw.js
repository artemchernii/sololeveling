/* N1 (15 Oct). The service worker: it only shows a push and opens its
   screen on a tap. No caching and no offline — the app reads Convex live,
   and offline is a different piece of work (__root.tsx). */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Leveling', body: event.data ? event.data.text() : '' }
  }
  /* The red count on the home screen icon, the bell's own number. */
  const badge =
    typeof data.badge === 'number' && self.navigator.setAppBadge
      ? self.navigator.setAppBadge(data.badge).catch(() => {})
      : Promise.resolve()
  event.waitUntil(
    badge.then(() =>
      self.registration.showNotification(data.title || 'Leveling', {
        body: data.body || '',
        /* N3: a company's mark where the system shows one (Mac). */
        icon: data.icon || '/icon-192.png',
        badge: '/icon-192.png',
        /* A reminder's occurrence id: one occurrence shows once. */
        tag: data.tag || undefined,
        data: { url: data.url || '/dashboard' },
      }),
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(
    event.notification.data?.url || '/dashboard',
    self.location.origin,
  ).href
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((open) => {
        const same = open.find((c) => c.url.startsWith(self.location.origin))
        if (same) return same.focus().then((c) => c.navigate(url))
        return self.clients.openWindow(url)
      }),
  )
})
