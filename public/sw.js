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
  event.waitUntil(
    self.registration.showNotification(data.title || 'Leveling', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      /* A reminder's occurrence id: an open tab's own reminder carries
         the same tag, so the Mac shows it once. */
      tag: data.tag || undefined,
      data: { url: data.url || '/dashboard' },
    }),
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
