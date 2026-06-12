/* Receipts service worker — handles web push notifications only. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Receipts", body: "You have a new update.", url: "/notifications" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      data: { url: data.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = all.find((c) => "focus" in c);
    if (existing) { existing.focus(); existing.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
