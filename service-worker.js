// --------------------------------------------------------
// FIRST AID PWA — OFFLINE LOGIN + SECURE PAGE ACCESS
// --------------------------------------------------------

const CACHE_NAME = "first-aid-cache-v9"; // <-- bumped version

const ASSETS = [
  "/",
  "/index.html",
  "/login.html",
  "/report.html",
  "/inventory.html",
  "/addStock.html",
  "/transfer.html",
  "/inventoryLogs.html",
  "/reportLogs.html",
  "/admin.html",
  "/communications.html",
"/css/communications.css",
"/js/communications.js",


  // ✅ NEW PAGES (Stocks Module)
  "/stock-management.html",
  "/consumable-records.html",
  "/fixture-records.html",

  // CSS
  "/css/dashboard.css",
  "/css/login.css",
  "/css/admin.css",
  "/css/inventory.css",
  "/css/addStock.css",
  "/css/transfer.css",
  "/css/report.css",
  "/css/reportLogs.css",

  // ✅ NEW CSS (per-page + shared base)
  "/css/base.css",
  "/css/stock-management.css",
  "/css/consumable-records.css",
  "/css/fixture-records.css",

  // JS
  "/js/app.js",
  "/js/login.js",
  "/js/dashboard.js",
  "/js/admin.js",
  "/js/session-check.js",
  "/js/permissions-check.js",
  "/js/inventory.js",
  "/js/inventoryLogs.js",
  "/js/timeline.js",
  "/js/report.js",
  "/js/transfer.js",

  // ✅ NEW JS (separated per page)
  "/js/core.js",
  "/js/stock-management.js",
  "/js/consumable-records.js",
  "/js/fixture-records.js",

  // Icons
  "/icons/icon-192.png",
  "/icons/icon-512.png",

  // Manifest + favicon
  "/manifest.json",
  "/favicon.ico"
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// SECURE PAGES
const SECURE_PAGES = [
  "index.html",
  "report.html",
  "inventory.html",
  "admin.html",
  "addStock.html",
  "transfer.html",
  "inventoryLogs.html",
  "reportLogs.html",
  "communications.html",


  // ✅ NEW SECURE PAGES
  "stock-management.html",
  "consumable-records.html",
  "fixture-records.html"
];

// LOGIN VALIDATION
async function validateLogin(request) {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return Response.redirect("/login.html");

  const client = clients[0];

  const loggedIn = await new Promise(resolve => {
    const mc = new MessageChannel();
    mc.port1.onmessage = e => resolve(e.data.loggedIn);
    client.postMessage({ cmd: "CHECK_LOGIN" }, [mc.port2]);
  });

  if (!loggedIn) return Response.redirect("/login.html");

  return (await caches.match(request)) || fetch(request);
}

// FETCH HANDLER
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // SECURE PAGE PROTECTION
  const isSecure = SECURE_PAGES.some(page => url.pathname.endsWith(page));
  if (isSecure) {
    return event.respondWith(validateLogin(event.request));
  }

  // Handle navigation (Android install bug fix)
  if (event.request.mode === "navigate") {
    return event.respondWith(
      caches.match("/index.html").then(cacheRes => cacheRes || fetch(event.request))
    );
  }

  // Default: cache → network → cache save
  event.respondWith(
    caches.match(event.request).then(cacheRes => {
      return (
        cacheRes ||
        fetch(event.request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchRes.clone());
            return fetchRes;
          });
        })
      );
    })
  );
});
