// Service Worker: alle Spieldateien zwischenspeichern, damit Wuselwelt offline läuft.
// Bei Änderungen VERSION hochzählen.
const VERSION = 'wuselwelt-v1';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/core/terrain.js',
  'js/render/sprites.js',
  'js/render/sprites-world.js',
  'js/render/sprites-build.js',
  'js/render/sprites-units.js',
  'js/render/sprites-icons.js',
  'js/core/rng.js',
  'js/core/config.js',
  'js/data/names.js',
  'js/data/texts.js',
  'js/sim/util.js',
  'js/sim/world.js',
  'js/sim/worldgen.js',
  'js/sim/path.js',
  'js/sim/structs.js',
  'js/sim/walls.js',
  'js/sim/cities.js',
  'js/sim/units.js',
  'js/sim/gov.js',
  'js/sim/diplo.js',
  'js/sim/creatures.js',
  'js/sim/env.js',
  'js/sim/powers.js',
  'js/sim/sim.js',
  'js/render/camera.js',
  'js/render/renderer.js',
  'js/ui/dom.js',
  'js/ui/tools.js',
  'js/ui/input.js',
  'js/ui/hud.js',
  'js/ui/panels.js',
  'js/ui/newworld.js',
  'js/ui/minimap.js',
  'js/main.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netz zuerst (immer aktuell), offline aus dem Zwischenspeicher; Schriften: Zwischenspeicher zuerst
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
