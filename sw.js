/* Roma 2026 — service worker: offline cache + push notifications */
var CACHE = "roma26-v3";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});

// pages: network-first (always fresh content, cache only as offline fallback)
// assets: stale-while-revalidate
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return fetch(e.request)
          .then(function (resp) {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          })
          .catch(function () { return cache.match(e.request); });
      })
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(e.request).then(function (cached) {
        var fresh = fetch(e.request)
          .then(function (resp) {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          })
          .catch(function () { return cached; });
        return cached || fresh;
      });
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
