const CACHE_NAME = "offstream-images-v1";
const IMAGE_HOSTS = ["pbcdnw.aoneroom.com", "aoneroom.com", "moviebox.ph", "movieboxhd.net"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith("offstream-images-")) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests
  if (request.method !== "GET") return;

  const isImageRequest =
    request.destination === "image" ||
    /\.(webp|jpg|jpeg|png|gif|svg|avif)(\?.*)?$/i.test(url.pathname) ||
    IMAGE_HOSTS.some((host) => url.hostname.includes(host));

  if (!isImageRequest) return;

  // Cache-first strategy for movie posters & images:
  // 1. First time: fetch from network and store in cache.
  // 2. Second time: instantly serve directly from cache.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === "opaque")) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // If network fails, return cached response if available
        return cachedResponse || Response.error();
      }
    })
  );
});
