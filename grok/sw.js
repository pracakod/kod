/* ==========================================================================
   Service Worker — Lista (Lista DareG 1.0v)
   Funkcje:
   - Precache „app shell” (HTML, CSS, JS)
   - Strategie cache:
     • Dokumenty (nawigacje): network-first z fallbackiem do cache (index.html)
     • Zasoby statyczne (CSS/JS): stale-while-revalidate
     • CDN (supabase-js, tesseract.js): stale-while-revalidate
     • Supabase API: bypass (nie buforujemy odpowiedzi API)
   - Obsługa skipWaiting/clients.claim, navigationPreload (jeśli dostępne)
   - Zdarzenia powiadomień: notificationclick (fokus/otwarcie aplikacji)
   ========================================================================== */

const VERSION = "1.0v-2025-11-17";
const STATIC_CACHE = `lista-static-${VERSION}`;
const RUNTIME_CACHE = `lista-runtime-${VERSION}`;

/* Zasoby do precache (app shell) */
const CORE_ASSETS = [
              // start_url"/index.html",
  "/manifest.webmanifest",
  // CSS
  "/css/style.css",
  "/css/components.css",
  "/css/animations.css",
  "/css/themes.css",
  // JS — moduły aplikacji
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

/* CDN hosty objęte runtime cachingiem */
const CDN_HOSTS = new Set([
  "cdn.jsdelivr.net"
  // można dodać kolejne hosty, jeżeli będzie to potrzebne
]);

/* Helpery */
const isNav = (req) => req.mode === "navigate";
const sameOrigin = (url) => new URL(url, self.location.origin).origin === self.location.origin;

/* Instalacja — precache */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
  })());
});

/* Aktywacja — sprzątanie starych cache, włączenie navigationPreload */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Sprzątanie
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("lista-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );

    // navigationPreload (jeśli dostępne)
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    await self.clients.claim();
  })());
});

/* Fetch — strategie */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nie obsługuj metod innych niż GET
  if (request.method !== "GET") return;

  // Bypass dla Supabase API (nie buforujemy odpowiedzi API)
  if (url.hostname.endsWith("supabase.co")) return;

  // Nawigacje dokumentów — network-first z fallbackiem do index.html
  if (isNav(request)) {
    event.respondWith((async () => {
      try {
        // navigationPreload (jeśli dostępne)
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const fresh = await fetch(request);
        return fresh;
      } catch {
        // fallback do precache
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match("/index.html");
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  // Zasoby statyczne (same-origin CSS/JS/…) — stale-while-revalidate
  if (sameOrigin(url.origin)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // CDN (np. supabase-js, tesseract.js) — stale-while-revalidate
  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Domyślnie — network-first z fallbackiem cache (bez presji na cache)
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

/* Implementacja stale-while-revalidate */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true }); // ignoruj query dla zasobów statycznych
  const networkFetch = fetch(request)
    .then((response) => {
      // Warunkowo zapisuj tylko odpowiedzi 200/opaques (CDN)
      if (response && (response.status === 200 || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Zwróć z cache natychmiast, a w tle odśwież
  return cached || (await networkFetch) || new Response("Offline", { status: 503, statusText: "Offline" });
}

/* Obsługa komunikatów z aplikacji (skipWaiting) */
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data === "SKIP_WAITING" || (event.data && event.data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

/* Powiadomienia — kliknięcie: fokus istniejącego okna lub otwarcie nowego */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Spróbuj skupić istniejące okno
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          return;
        }
      } catch {}
    }
    // W razie braku — otwórz nowe
    await self.clients.openWindow("/");
  })());
});

/* (Opcjonalnie) obsługa push — jeżeli w przyszłości zostanie użyta */
self.addEventListener("push", (event) => {
  // Jeżeli serwer push dostarczy payload, pokaż jako powiadomienie
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Powiadomienie";
    const body = data.body || "Masz nowe powiadomienie.";
    event.waitUntil(self.registration.showNotification(title, { body, tag: data.tag || "lista" }));
  } catch {
    // brak payloadu — pomijamy
  }
});