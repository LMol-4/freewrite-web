/* global BUILD, ASSETS, SHELL_HASH */
const CACHE = `freewrite-${BUILD}`;
const PATHS = new Set(ASSETS);
const SHELL = '/offline';
async function valid(response, path) {
  if (!response || response.status !== 200 || response.redirected || response.type === 'opaque') return false;
  const type = response.headers.get('content-type') || '';
  if (path === SHELL) {
    if (!type.includes('text/html')) return false;
    const bytes = await response.clone().arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    return hash === SHELL_HASH;
  }
  return path.endsWith('.js') ? /javascript/.test(type) : path.endsWith('.css') ? type.includes('text/css') : /^(font|image|audio)\//.test(type) || type.includes('application/font');
}
async function complete(cache) {
  for (const path of [SHELL, ...ASSETS]) if (!await cache.match(path)) return false;
  return true;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Reject mixed deployments and failed dependencies. The previous worker
      // and its complete cache stay active if this installation fails.
      for (const path of [SHELL, ...ASSETS]) {
        const response = await fetch(path, { cache: 'reload', credentials: 'omit', redirect: 'error' });
        if (!await valid(response, path)) throw Error(`Invalid offline asset: ${path}`);
        await cache.put(path, response);
      }
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
// No skipWaiting: a new build takes over only after old controlled clients close.
// Keep old app caches so a browser-restored old document can still load its chunks.
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  if (event.data === 'readiness') event.waitUntil((async () => { const cache = await caches.open(CACHE); event.ports[0]?.postMessage({ ready: await complete(cache), build: BUILD }); })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('RSC') || request.headers.has('Next-Action')) return;
  if (PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const stored = await cache.match(url.pathname); if (stored) return stored;
      const response = await fetch(request);
      if (await valid(response, url.pathname)) await cache.put(url.pathname, response.clone());
      return response;
    })());
  } else if (url.pathname.startsWith('/_next/static/') && /\.(js|css|woff2?)$/.test(url.pathname)) {
    // Only assets already admitted by an older build's positive allowlist are
    // eligible here. Never populate an old cache from an arbitrary request.
    event.respondWith((async () => {
      for (const name of (await caches.keys()).filter(name => name.startsWith('freewrite-'))) {
        const stored = await (await caches.open(name)).match(url.pathname);
        if (stored) return stored;
      }
      return fetch(request);
    })());
  } else if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === SHELL)) {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try { return await fetch(request, { signal: controller.signal }); }
      catch {
        const cache = await caches.open(CACHE);
        if (await complete(cache)) return await cache.match(SHELL);
        return new Response('Offline writing is not ready. Reconnect to prepare this device.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      } finally { clearTimeout(timer); }
    })());
  }
});
