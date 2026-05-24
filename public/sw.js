const CACHE_NAME = "map-diary-next-shell-v2";
const APP_SHELL = ["/manifest.webmanifest", "/icon.svg", "/maskable-icon.svg"];
const STATIC_PATHS = ["/manifest.webmanifest", "/icon.svg", "/maskable-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const oldKeys = keys.filter((key) => key !== CACHE_NAME);
        return Promise.all(oldKeys.map((key) => caches.delete(key))).then(() => oldKeys.length > 0);
      })
      .then((hadOldCaches) => self.clients.claim().then(() => hadOldCaches))
      .then((hadOldCaches) => {
        if (!hadOldCaches) return undefined;
        return self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then((clients) =>
            Promise.all(
              clients.map((client) => {
                if ("navigate" in client) return client.navigate(client.url);
                return undefined;
              })
            )
          );
      })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match("/")
            .then(
              (cached) =>
                cached ||
                new Response("<!doctype html><title>Map Diary</title><p>Map Diary is offline.</p>", {
                  headers: { "Content-Type": "text/html; charset=utf-8" }
                })
            )
        )
    );
    return;
  }

  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isStaticAsset =
    isSameOrigin &&
    (requestUrl.pathname.startsWith("/_next/static/") || STATIC_PATHS.includes(requestUrl.pathname));
  const isImage = event.request.destination === "image";

  if (!isStaticAsset && !isImage) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetched;
    })
  );
});
