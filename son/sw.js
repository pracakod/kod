const VERSION = "1.0v-2025-11-17";
const STATIC_CACHE = `lista-static-${VERSION}`;
const RUNTIME_CACHE = `lista-runtime-${VERSION}`;
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/css/style.css",
  "/css/components.css",
  "/css/animations.css",
  "/css/themes.css",
  "/js/app.js",
  "/js/storage.js",
  "/js/ui.js",
  "/js/swipe-handler.js",
  "/js/archive.js",
  "/js/settings.js",
  "/js/barcode-scanner.js",
  "/js/statistics.js",
  "/js/loyalty-cards.js",
  "/js/list-manager.js",
  "/js/auth.js",
  "/js/supabase-client.js",
  "/js/sharing.js",
  "/js/receipts.js",
  "/js/recipes.js",
  "/js/vacations.js",
  "/js/notifications.js",
  "/js/important-dates.js",
  "/js/calendar.js",
  "/js/profile.js"
];
const CDN_HOSTS = new Set([
  "cdn.jsdelivr.net"
]);
const isNav = (req) => req.mode === "navigate";
const sameOrigin = (url) => new URL(url, self.location.origin).origin === self.location.origin;
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("lista-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.hostname.endsWith("supabase.co")) return;
  if (isNav(request)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const fresh = await fetch(request);
        return fresh;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match("/index.html");
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }
  if (sameOrigin(url.origin)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      return cached || new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && (response.status === 200 || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await networkFetch) || new Response("Offline", { status: 503, statusText: "Offline" });
}
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data === "SKIP_WAITING" || (event.data && event.data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          return;
        }
      } catch {}
    }
    await self.clients.openWindow("/");
  })());
});
self.addEventListener("push", (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Powiadomienie";
    const body = data.body || "Masz nowe powiadomienie.";
    event.waitUntil(self.registration.showNotification(title, { body, tag: data.tag || "lista" }));
  } catch {
  }
});