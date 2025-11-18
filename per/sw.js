"use strict";

const CACHE_NAME = "lista-v1-0-0";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.webmanifest.json",
  
  // CSS
  "/css/style.css",
  "/css/components.css",
  "/css/animations.css",
  "/css/themes.css",
  
  // JavaScript
  "/js/app.js",
  "/js/storage.js",
  "/js/supabase-client.js",
  "/js/auth.js",
  "/js/ui.js",
  "/js/list-manager.js",
  "/js/swipe-handler.js",
  "/js/notifications.js",
  "/js/sharing.js",
  "/js/barcode-scanner.js",
  "/js/receipts.js",
  "/js/recipes.js",
  "/js/loyalty-cards.js",
  "/js/calendar.js",
  "/js/important-dates.js",
  "/js/vacations.js",
  "/js/statistics.js",
  "/js/archive.js",
  "/js/settings.js",
  "/js/profile.js"
];

// Instalacja
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

// Aktywacja
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

// Fetch
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  
  // Ignoruj Supabase i CDN
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
              return caches.match('/index.html');
            }
          });
      })
  );
});
