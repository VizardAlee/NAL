importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js");

const STATIC_CACHE = "nal-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/favicon.ico",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-512x512.png",
];

firebase.initializeApp({
  apiKey: "AIzaSyDYitdmm5H_7GkRR8PAmPMIyAQ9sS9Xggc",
  authDomain: "studio-1298078893-e7941.firebaseapp.com",
  projectId: "studio-1298078893-e7941",
  storageBucket: "studio-1298078893-e7941.appspot.com",
  messagingSenderId: "1018583979606",
  appId: "1:1018583979606:web:d50ec535e8fbc4c231cdf7",
});

const messaging = firebase.messaging();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: "reload" }))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("nal-") && cacheName !== STATIC_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offlineResponse = await caches.match(OFFLINE_URL);
        return offlineResponse || Response.error();
      })
    );
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith("/_next/static/") ||
    requestUrl.pathname.startsWith("/icons/") ||
    requestUrl.pathname === "/favicon.ico" ||
    requestUrl.pathname === "/manifest.json";

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request, { ignoreSearch: true });
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || networkResponse;
    })
  );
});

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "NAL Notification";
  const options = {
    body: payload.notification?.body || "Open NAL to view details.",
    icon: payload.notification?.icon || "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data: {
      link: payload.fcmOptions?.link || payload.data?.link || "/",
    },
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  const destination = new URL(link, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        const existingClient = windowClients.find((client) => client.url === destination);
        if (existingClient) {
          return existingClient.focus();
        }

        if (windowClients[0] && "navigate" in windowClients[0]) {
          await windowClients[0].navigate(destination);
          return windowClients[0].focus();
        }

        return clients.openWindow(destination);
      })
  );
});
