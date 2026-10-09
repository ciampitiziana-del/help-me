self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || "HELP ME", {
      body: data.body || "Nuova richiesta di aiuto",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: {
        url: "/requests",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(self.clients.openWindow("/requests"));
});
