// Jääkaappini service worker: sovellus toimii myös ilman verkkoyhteyttä.
// Kasvata versiota, kun tiedostolista muuttuu.
const CACHE = "jaakaappini-v2";
const FILES = [
  "./",
  "index.html",
  "css/styles.css",
  "js/data.js",
  "js/app.js",
  "avattu-purkki.png",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Verkko ensin (aina uusin versio), välimuisti varalla, kun verkkoa ei ole.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then(hit => hit || (request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

// Ilmoitusta napauttamalla avataan sovellus (tai siirrytään jo avoimeen ikkunaan).
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const open = windows.find(w => "focus" in w);
      return open ? open.focus() : self.clients.openWindow("./");
    })
  );
});
