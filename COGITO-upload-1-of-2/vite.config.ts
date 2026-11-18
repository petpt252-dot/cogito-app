/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Emits sw.js with a precache list of every built asset, so the app works fully offline after first load.
function offlineServiceWorker(): Plugin {
  return {
    name: 'memory-lab-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const assets = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', ...files.filter((f) => f !== 'index.html')];
      const version = Date.now().toString(36);
      // Only this app's own caches are ever deleted ('memory-lab-' was its earlier prefix), so other apps
      // on the same origin keep theirs. index.html is the offline fallback for page navigations only.
      const source = `const PREFIX = 'cogito-assets-';
const CACHE = PREFIX + '${version}';
const OWN = (k) => k.startsWith(PREFIX) || k.startsWith('memory-lab-');
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => OWN(k) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const nav = e.request.mode === 'navigate';
  e.respondWith(
    caches.open(CACHE).then((cache) => cache.match(e.request, { ignoreSearch: nav })).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => (nav ? caches.open(CACHE).then((c) => c.match('index.html')) : Response.error()))
    )
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), offlineServiceWorker()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
