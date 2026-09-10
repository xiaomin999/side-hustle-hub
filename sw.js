/* 副业收集工作台 Service Worker - 离线缓存 */
var CACHE = 'shh-v5';
var ASSETS = [
  './', './index.html',
  './style.css?v=4', './app.js?v=4', './data.js?v=4',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 网络优先（脚本/样式/页面），缓存兜底：保证每次部署都拿到最新代码，离线时仍能打开
function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () { return caches.match(req).then(function (h) { return h || caches.match('./index.html'); }); });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (/\.(js|css|html?)(?:\?.*)?$/.test(url) || url.endsWith('/') || url.endsWith('/index.html')) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  // 图片等静态资源：缓存优先，后台更新
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) {
        fetch(e.request).then(function (res) {
          if (res && res.status === 200) caches.open(CACHE).then(function (c) { c.put(e.request, res.clone()); });
        }).catch(function () { });
        return hit;
      }
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
