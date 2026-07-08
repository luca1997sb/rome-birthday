/* Roma 2026 — service worker: push notifications + offline-only fallback cache.
   Everything is fetched fresh from the network on every load ({cache:"no-store"}
   also bypasses the browser HTTP cache, which GitHub Pages sets to 10 min);
   the cache is used ONLY when the network is unreachable. */
var CACHE = "roma26-v4";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return fetch(e.request.url, { cache: "no-store", credentials: "same-origin" })
        .then(function (resp) {
          if (resp.ok) cache.put(e.request.url, resp.clone());
          return resp;
        })
        .catch(function () { return cache.match(e.request.url); });
    })
  );
});

self.addEventListener("push", function (e) {
  var data = { title: "Roma 2026", body: "Something new on the weekend page.", url: "./" };
  try { Object.assign(data, e.data.json()); } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: data.url }
    }).then(function () {
      if (!navigator.setAppBadge) return;
      return self.registration.getNotifications().then(function (list) {
        return navigator.setAppBadge(Math.max(list.length, 1)).catch(function () {});
      });
    })
  );
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
  var url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      return clients.openWindow(url);
    })
  );
});
