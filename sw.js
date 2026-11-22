/* ============================================================================
 * Service Worker — Club U-AUBEN Smart Grid & SCADA (Mode Hors Ligne / PWA)
 * Met en cache les pages, le logo officiel et les librairies CDN nécessaires.
 * ============================================================================ */

const CACHE_NAME = "uauben-smartgrid-v1";

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./cablage_smartgrid.html",
  "./scada_smartgrid.html",
  "./logo_club.png",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.json"
];

const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
  "https://unpkg.com/mqtt/dist/mqtt.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(LOCAL_ASSETS);
      // Pré-cache des librairies CDN sans bloquer l'installation si une ressource est lente
      await Promise.allSettled(
        CDN_ASSETS.map(async (url) => {
          try {
            const resp = await fetch(url, { mode: "cors" });
            if (resp && resp.ok) await cache.put(url, resp.clone());
          } catch (e) {
            try {
              const opaque = await fetch(url, { mode: "no-cors" });
              if (opaque) await cache.put(url, opaque.clone());
            } catch (err) {}
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // Network-first avec repli cache pour les pages locales (toujours à jour + 100% hors ligne)
    event.respondWith(
      fetch(req)
        .then((networkResp) => {
          if (networkResp && networkResp.ok) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResp;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("Ressource indisponible hors ligne.", { status: 503 });
        })
    );
    return;
  }

  // Cache-first avec mise en cache dynamique pour les CDN (Three.js, Chart.js, MQTT.js, Google Fonts)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((networkResp) => {
        if (networkResp && (networkResp.ok || networkResp.type === "opaque")) {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResp;
      }).catch(() => cached || new Response("", { status: 504 }));
    })
  );
});
