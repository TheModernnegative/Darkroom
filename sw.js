// offline cache: app shell + film LUTs (cache-first; bump VERSION to update)
const VERSION='dr-1794704865';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(VERSION).then(c=>c.addAll(['./','index.html','js/glutil.js','js/engine.js','js/borders.js','js/ui.js','js/tools.js','js/studio.js','js/mobile.js','data/manifest.json']))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return;
  e.respondWith(caches.open(VERSION).then(async c=>{ const hit=await c.match(e.request); if(hit) return hit;
    const r=await fetch(e.request); if(r.ok && new URL(e.request.url).origin===location.origin) c.put(e.request,r.clone()); return r; })); });
