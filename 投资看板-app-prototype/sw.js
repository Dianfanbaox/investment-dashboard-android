/* investment-dashboard service worker */
const CACHE = 'acid-app-v271';
/* 注意：清单里的资源 URL 必须带与 index.html 相同的 ?v= 版本戳。
   页面请求的是 `app.js?v=271`，若这里预缓存的是无戳的 `app.js`，两者是两条不同的
   cache key → 预缓存永远命中不了，等于白缓存一堆离线时取不到的文件。 */
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css?v=271',
  './mock.js?v=271',
  './market.js?v=271',
  './fifo.js?v=271',
  './discipline.js?v=271',
  './app.js?v=271',
  './lib/chart.umd.min.js?v=271',
  './lib/papaparse.min.js?v=271',
  './lib/capacitor-plugins.js?v=271',
  './lib/fontawesome/css/all.min.css?v=271',
  './lib/fontawesome/webfonts/fa-solid-900.woff2',
  './lib/fontawesome/webfonts/fa-regular-400.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-1024.png',
  './assets/icons/splash-book.png',
  './assets/icons/splash-arrow.png'
];

/* 预缓存必须逐条 add：
 * cache.addAll() 是原子操作 —— 清单里只要有一个 404，整批全部 reject，
 * 结果就是一个资源都没缓存，离线能力形同虚设。
 * 上一版正是因为清单写了不存在的 icon-192.svg / icon-512.svg（工程里只有 .png），
 * 且失败被 catch 空吞掉，导致缓存长期为空且完全不可观测。
 * 逐条 add 后：单个资源缺失只跳过它自己，其余照常缓存，并留下日志。 */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(ASSETS.map(function (url) {
      return c.add(url).catch(function (err) {
        console.warn('[sw] 预缓存失败，已跳过：' + url, err && err.message);
      });
    }))).catch(function (err) { console.warn('[sw] install 阶段异常：', err); })
  );
  self.skipWaiting();
});

/* 页面点了「刷新」后：让等待中的新 SW 立即接管，
   否则 reload 之后拿到的还是旧 SW 控制的旧缓存页面。 */
self.addEventListener('message', (e) => {
  if (e && e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 跨域 API（腾讯行情、硅基流动）走网络，不缓存
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 带版本戳 ?v=N 的静态资源：网络优先——发版后刷新一次立即拿最新文件；离线回退缓存
  if (url.searchParams.has('v')) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match(req.url.split('?')[0])))
    );
    return;
  }
  // 页面导航：网络优先——发版后用户刷新一次即拿最新 HTML；离线回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }
  // 静态资源：缓存优先，未命中走网络并回写
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
        return res;
      }).catch(() => cached)
    )
  );
});
