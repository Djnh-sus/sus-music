const CACHE_PREFIX = "app-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const MAX_CACHE_ENTRIES = 150;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_CACHE_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);

  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);

  if (response.status === 200 && response.type === "basic") {
    const copy = response.clone();
    event.waitUntil(
      cache
        .put(request, copy)
        .then(() => trimCache(cache))
        .catch(() => {})
    );
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isStaticAsset =
    url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");

  if (!isStaticAsset) return;

  event.respondWith(cacheFirst(event));
});
