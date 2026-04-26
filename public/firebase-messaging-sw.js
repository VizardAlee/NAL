importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDYitdmm5H_7GkRR8PAmPMIyAQ9sS9Xggc",
  authDomain: "studio-1298078893-e7941.firebaseapp.com",
  projectId: "studio-1298078893-e7941",
  storageBucket: "studio-1298078893-e7941.appspot.com",
  messagingSenderId: "1018583979606",
  appId: "1:1018583979606:web:d50ec535e8fbc4c231cdf7",
});

const messaging = firebase.messaging();

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
  event.waitUntil(clients.openWindow(link));
});
