/* Chomnenh POS service worker.
 *
 * Deliberately small. The POS is useless without the API (every page reads live
 * data), so this does NOT try to make the app work offline. It does two things:
 *
 *  1. Serves a branded, self-reloading fallback page when a navigation fails,
 *     instead of the browser's "This page couldn't load" error. Two different
 *     faults look identical to staff and both are handled here:
 *       - the network died (tablet roaming between APs)   -> fetch() rejects
 *       - the origin is not serving (shared-hosting cold start, redeploy,
 *         app restart)                                    -> fetch() RESOLVES
 *         with a 502/503/504 from Hostinger's proxy
 *     The second case is why a plain `fetch().catch()` was not enough: a proxy
 *     error is a perfectly good response as far as fetch is concerned, so it
 *     used to be passed through and rendered as an error page.
 *  2. Cache-first for content-hashed build assets and uploaded images, which
 *     also means a redeploy can't 404 a chunk out from under an open tab.
 *
 * HARD RULE: never cache or synthesise a response for anything that could be an
 * RSC payload. HTML and RSC share a URL and differ only by the `RSC` request
 * header, so a cache that ignores that header serves an RSC flight payload as a
 * document (and vice-versa) — which is exactly the hCDN bug that caused "This
 * page couldn't load" in the first place. The RSC guard therefore runs FIRST in
 * the fetch handler, ahead of anything that can write to a cache. Only
 * `request.mode === "navigate"` is treated as a document; /api and /socket.io
 * are passed straight through and are never cached — the POS must always read
 * live data, and this file does not fake being offline.
 *
 * Why documents are cached at all (the point of the whole thing): every page is
 * a "use client" component, so the HTML for a route is an empty shell that never
 * changes and holds no user data. But force-dynamic marks it no-store, so before
 * this the app had to reach Hostinger on EVERY navigation for identical bytes,
 * leaving it zero tolerance for a blip on shop Wi-Fi. Serving the shell from
 * here means the navigation succeeds instead of erroring; live data still comes
 * from /api, which is where it belongs.
 */

// Only the shell is versioned. The asset/image caches are keyed by URLs whose
// content can never change (build hashes, never-reused image ids), so there is
// nothing to invalidate — and purging them on activate would be actively
// harmful: a tab still running the PREVIOUS build would lose its cached chunks
// and have to refetch them from a server that no longer has them (404 ->
// ChunkLoadError). Keeping these names fixed is what makes skipWaiting safe.
const SHELL_VERSION = "v2";
const SHELL_CACHE = `chomnenh-shell-${SHELL_VERSION}`;
const ASSET_CACHE = "chomnenh-assets-v1";
const IMAGE_CACHE = "chomnenh-images-v1";
const PAGE_CACHE = "chomnenh-pages-v1";

// How long to wait for a document before giving up and using the copy we
// already have. A healthy origin answers in ~0.4s, so this only ever fires on a
// genuinely stuck request — the case that used to hang and then show the
// browser's error page.
const DOC_TIMEOUT_MS = 6000;

// Which documents are safe to keep. This is load-bearing and depends on an
// invariant worth stating: EVERY admin page is a "use client" component, auth is
// enforced client-side by app/admin/layout.tsx, and all data arrives over /api.
// So these documents are empty app shells — identical for every user, with no
// session or business data baked in. That is what makes it safe to serve one
// user's cached shell to the next person who logs in on the same tablet.
// If a route is ever converted to a server component that renders real data,
// it MUST be excluded here or that data will leak between users.
function isShellRoute(pathname) {
  return pathname === "/login" || pathname.startsWith("/admin");
}

const OFFLINE_URL = "/offline.html";
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/images/Chomnenh-logo.png",
  "/images/chomnenh-mark.png",
];

// Every fixed route, fetched once at install so a blip cannot strand staff on a
// page they simply had not opened yet. Caching on visit alone was not enough:
// the first trip to Inventory in a shift is exactly when the network is least
// likely to be forgiven. These are empty shells (see isShellRoute), so they can
// be fetched before anyone logs in and are the same for every user.
// The [id] routes are absent on purpose — they are unbounded, and reaching one
// during an outage falls back to the retry page, which recovers on its own.
const PRECACHE_ROUTES = [
  "/login",
  "/admin/pos",
  "/admin/dashboard",
  "/admin/inventory",
  "/admin/invoices",
  "/admin/clients",
  "/admin/reports",
  "/admin/bonus",
  "/admin/profile",
  "/admin/settings",
  "/admin/staff",
];

// addAll is all-or-nothing: one flaky request and the whole install rejects,
// leaving the tablet with NO worker and no fallback at all — the opposite of the
// goal. Cache what we can and let the rest fill in on first visit.
async function cacheAllSettled(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok && response.status === 200) await cache.put(url, response);
      } catch {
        /* fills in on first visit */
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      cacheAllSettled(SHELL_CACHE, SHELL_ASSETS),
      cacheAllSettled(PAGE_CACHE, PRECACHE_ROUTES),
    ])
      // Take over immediately instead of waiting for every tab to close. The
      // POS runs all day on a tablet that is never closed, so the default
      // waiting behaviour means a fix shipped to this file would never reach
      // the devices that need it. This does NOT reload anything by itself
      // (nothing listens for controllerchange), and an activated new worker
      // cannot serve a mismatched document because no HTML/RSC is ever cached.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE, PAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Cache-first: the URL's content never changes (build hashes, immutable image
// ids), so a hit is always correct and a redeploy can't 404 an open tab's chunk.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.status === 200) {
    cache.put(request, response.clone());
  }
  return response;
}

// Hostinger's proxy answers with these while the Node app is cold-starting,
// restarting after a deploy, or has fallen over. They are infrastructure blips,
// not application output, so they are worth hiding behind the retry page.
// A Next-rendered 500 is deliberately NOT in this list: that is a real app error
// and masking it as "connection problem" would hide a bug from us.
const GATEWAY_ERRORS = [502, 503, 504];

// Resolves to a good document response, or throws so the caller can fall back.
// A hung request is a failure too: without the timeout the browser just spins
// and then renders its own error page, which is the thing we are eliminating.
async function fetchDocument(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOC_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (GATEWAY_ERRORS.includes(response.status)) {
      throw new Error(`origin unavailable (${response.status})`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// Documents: network-first, then the shell we already have.
//
// This is the actual fix rather than a nicer error screen. The app shell for a
// route never changes, but force-dynamic (needed to stop hCDN mixing HTML and
// RSC) marks it no-store, so every navigation had to reach Hostinger for bytes
// that are always identical. That gave the POS zero tolerance for a blip on shop
// Wi-Fi. Keeping a copy here removes the dependency: the navigation SUCCEEDS
// from cache instead of failing prettily.
//
// Network-first, not cache-first, on purpose: on a healthy network staff always
// get the current build, so a deploy lands on the very next navigation and the
// cache is only ever consulted when the request actually failed.
async function handleDocument(request) {
  const url = new URL(request.url);
  const shell = isShellRoute(url.pathname);

  try {
    const response = await fetchDocument(request);
    if (shell && response.status === 200) {
      const cache = await caches.open(PAGE_CACHE);
      // Key by URL string: a navigate Request carries mode/headers we do not
      // want influencing the match, and the RSC variant of this URL must never
      // land in this cache (it is filtered out before we get here).
      cache.put(url.href, response.clone());
    }
    return response;
  } catch {
    if (shell) {
      const cache = await caches.open(PAGE_CACHE);
      const hit = await cache.match(url.href);
      if (hit) return hit; // the navigation succeeds; no error page, no reload loop
    }
    return offlineFallback();
  }
}

async function offlineFallback() {
  const cache = await caches.open(SHELL_CACHE);
  const page = await cache.match(OFFLINE_URL);
  if (page) {
    // 503 rather than 200: this is not the page that was asked for, and it
    // keeps the response from ever being mistaken for real content.
    return new Response(page.body, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}

// Network-first: brand art is served revalidating, so a deploy that changes the
// logo must win. The cached copy exists only so the retry page can still show
// the mark while the origin is unreachable — which means this has to treat a
// gateway error as a miss for the same reason the document handler does. When
// the whole origin is 503ing, `fetch` resolves with that 503, and returning it
// rendered a broken image on the very page that exists to look reassuring.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (GATEWAY_ERRORS.includes(response.status)) throw new Error("origin unavailable");
    if (response.ok && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API host, fonts, anything else

  // The HARD RULE, enforced FIRST so nothing below can ever see an RSC request.
  // A flight payload is never a navigation (Next fetches it from JS, so its mode
  // is same-origin/cors), which means this cannot currently fire before the
  // document branch — but the ordering is deliberate. The original outage was
  // caused by exactly one cache confusing RSC with HTML, so this stays ahead of
  // every branch that can call cache.put, rather than relying on that argument
  // staying true across future Next versions.
  if (request.headers.has("RSC")) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  // Documents. Must catch a rejected fetch, a gateway error AND a hang, since
  // all three otherwise become "This page couldn't load". Note this also covers
  // client-side navigation: when Next's RSC fetch fails it falls back to a hard
  // navigation, which arrives here and is served from the shell cache.
  if (request.mode === "navigate") {
    event.respondWith(handleDocument(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Brand art the offline page itself needs: without this branch the request
  // would go straight to the dead network and the offline page would render a
  // broken image.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Uploaded product/logo images: served with immutable 30d caching and ids are
  // never reused, so they are safe to keep.
  if (url.pathname.startsWith("/uploads/img/")) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  }
});
