/* 離線快取。修改經文、圖片或程式後，請把 VERSION 加一，手機才會取得新版本。 */
const VERSION = 'v4';
const CACHE = `mercy-divine-${VERSION}`;

const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/prayers.json',
  './data/images.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// 聖像清單記在 data/images.json，安裝時一併讀取並快取，
// 這樣新增圖片只需改那份清單，不必動這裡的檔案列表。
async function imageAssets() {
  try {
    const res = await fetch('./data/images.json', { cache: 'no-cache' });
    const data = await res.json();
    return (data.images || []).map((img) => `./${String(img.file).replace(/^\.?\//, '')}`);
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const assets = [...CORE, ...(await imageAssets())];
    // 逐項快取：單一檔案缺失不應讓整次安裝失敗。
    await Promise.all(assets.map((url) => cache.add(url).catch(() => {})));
    // 確認核心檔案齊全，否則離線時會開不起來。
    const shell = await cache.match('./index.html');
    if (!shell) throw new Error('核心檔案快取失敗');
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      // 離線且未快取：導覽請求一律回傳程式主頁。
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('離線中，且此資源尚未快取。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
