"use strict";

const CACHE_NAME = "lista-v1-0-0";
const BASE_PATH = "/kod/per";

const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.webmanifest.json`,
  
  // CSS
  `${BASE_PATH}/css/style.css`,
  `${BASE_PATH}/css/components.css`,
  `${BASE_PATH}/css/animations.css`,
  `${BASE_PATH}/css/themes.css`,
  
  // JavaScript
  `${BASE_PATH}/js/app.js`,
  `${BASE_PATH}/js/storage.js`,
  `${BASE_PATH}/js/supabase-client.js`,
  `${BASE_PATH}/js/auth.js`,
  `${BASE_PATH}/js/ui.js`,
  `${BASE_PATH}/js/list-manager.js`,
  `${BASE_PATH}/js/swipe-handler.js`,
  `${BASE_PATH}/js/notifications.js`,
  `${BASE_PATH}/js/sharing.js`,
  `${BASE_PATH}/js/barcode-scanner.js`,
  `${BASE_PATH}/js/receipts.js`,
  `${BASE_PATH}/js/recipes.js`,
  `${BASE_PATH}/js/loyalty-cards.js`,
  `${BASE_PATH}/js/calendar.js`,
  `${BASE_PATH}/js/important-dates.js`,
  `${BASE_PATH}/js/vacations.js`,
  `${BASE_PATH}/js/statistics.js`,
  `${BASE_PATH}/js/archive.js`,
  `${BASE_PATH}/js/settings.js`,
  `${BASE_PATH}/js/profile.js`
];

self.addEventListener("install", (event) => {
  console.log("[SW] Instalacja...");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Cache otwarty");
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Błąd cache:", err))
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Aktywacja...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[SW] Usuwanie starego cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  
  if (event.request.url.includes("supabase.co") || 
      event.request.url.includes("cdn.jsdelivr.net")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.mode === 'navigate') {
              return caches.match(`${BASE_PATH}/index.html`);
            }
          });
      })
  );
});
