/*
 * mdstudio service worker: lets the studio open and work with no network.
 * No build step: the app version comes from the registration URL (`/sw.js?v=<version>`), so each
 * release is a new worker with its own cache and the old caches are deleted on activate.
 *
 * - Pages are fetched network first (so a release shows up at once) and kept for offline. An
 *   editor page that was never cached falls back to the cached editor.
 * - Built files under /assets/ have hashed names, so they are cache first.
 * - Fonts, icons and the manifest are served from cache while it refreshes in the background.
 * - Everything else is left alone: other origins (AI providers), the API, anything that isn't GET.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `mdstudio-${VERSION}`;
/** Fetched on install, with the scripts and styles they link to, so the first offline start works. */
const SHELL = ["/editor", "/"];
const NAVIGATION_TIMEOUT_MS = 4000;

/** What to do with a request: "navigate", "immutable", "static" or "skip" (let the network handle it). */
function classify(url, method, mode, origin) {
  if (method !== "GET" || url.origin !== origin) return "skip";
  const path = url.pathname;
  if (path === "/sw.js" || path.startsWith("/api/") || path.startsWith("/_")) return "skip";
  if (mode === "navigate") return /\.[a-z0-9]+$/i.test(path) ? "skip" : "navigate";
  // Hosted images: a name never points at different bytes, so the cached copy is always right.
  if (path.startsWith("/assets/") || path.startsWith("/a/")) return "immutable";
  if (/^\/(fonts|katex)\//.test(path) || /\.(png|svg|ico|webmanifest|woff2)$/.test(path))
    return "static";
  return "skip";
}

/** The built scripts and styles a page's HTML refers to. */
function assetsIn(html) {
  return [...new Set(html.match(/\/assets\/[^"'\s)<>]+?\.(?:js|css)/g) ?? [])];
}

/** Cached pages to try, in order, when a page can't be fetched and wasn't cached itself. */
function fallbacks(path) {
  return path.startsWith("/editor") ? ["/editor", "/"] : ["/", "/editor"];
}

const OFFLINE_PAGE =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Offline | mdstudio</title>" +
  '<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">' +
  "<h1>You're offline</h1><p>This page wasn't saved for offline use yet. Open the editor once while " +
  'online and it will work without a connection from then on.</p><p><a href="/editor">Open the editor</a></p>';

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const path of SHELL) {
        try {
          const res = await fetch(path);
          if (!res.ok || res.redirected) continue;
          await cache.put(path, res.clone());
          for (const asset of assetsIn(await res.text())) await cache.add(asset).catch(() => {});
        } catch {
          // offline during install: the pages are cached as they are visited instead
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("mdstudio-") && name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    // a redirected response can't be replayed for a navigation, so those are not kept
    if (res.ok && !res.redirected && (res.headers.get("content-type") ?? "").includes("text/html"))
      cache.put(request, res.clone());
    return res;
  } catch {
    clearTimeout(timer);
    const own = await cache.match(request, { ignoreSearch: true });
    if (own) return own;
    for (const path of fallbacks(new URL(request.url).pathname)) {
      const page = await cache.match(path);
      if (page) return page;
    }
    return new Response(OFFLINE_PAGE, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const kind = classify(new URL(request.url), request.method, request.mode, self.location.origin);
  if (kind === "navigate") event.respondWith(navigate(request));
  else if (kind === "immutable") event.respondWith(cacheFirst(request));
  else if (kind === "static") event.respondWith(staleWhileRevalidate(event));
});

// The page lists what it has loaded so far; files fetched before this worker took control (the
// very first visit) were not seen by the fetch handler, so they are saved here.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-urls" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const href of event.data.urls) {
        let url;
        try {
          url = new URL(href, self.location.origin);
        } catch {
          continue;
        }
        const kind = classify(url, "GET", "no-cors", self.location.origin);
        if (kind !== "immutable" && kind !== "static") continue;
        if (!(await cache.match(url.pathname))) await cache.add(url.pathname).catch(() => {});
      }
    })(),
  );
});

// For tests: the routing decisions, which don't touch the network or caches.
self.__swForTests = { classify, assetsIn, fallbacks };
