import { NextRequest } from "next/server";

// Buffered server-side proxy to the Express API, used by the /api and
// /uploads catch-all route handlers INSTEAD of next.config rewrites.
//
// Why not rewrites: on Hostinger, responses STREAMED through Next's rewrite
// proxy lose their body 30-45% of the time (200 + Content-Length: 0 with all
// other headers intact; measured live 2026-07-17), while Next-GENERATED
// responses are 100% reliable (0/40) and server-side fetch always receives
// the full body (30/30). So the body is dropped in the platform's handling of
// piped proxy responses, not upstream. Buffering here converts the proxied
// body into a normal Next response, which takes the reliable path. Payloads
// are small (JSON, <=5MB images), so buffering costs nothing that matters.
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:5001";

// Standard hop-by-hop headers, plus host (fetch sets its own from the target)
// and content-encoding/content-length: undici transparently decompresses the
// upstream body, so the original values would lie about the buffered bytes.
const STRIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "host",
]);

const NULL_BODY_STATUSES = [101, 204, 205, 304];

// During the body-stripping outage (2026-07-17) browsers cached empty 200
// /api bodies together with the ETag of the FULL body Express computed. With
// no Cache-Control on API responses, every later fetch revalidated with
// If-None-Match, Express answered 304, and the browser re-served its empty
// cached body indefinitely: pages showed "no data" while curl saw everything.
// So for /api: never forward conditional headers (upstream always returns a
// full 200, which replaces the poisoned entry) and mark responses no-store
// (browsers stop caching API JSON at all). /uploads keeps its immutable
// caching by design.
const CONDITIONAL = ["if-none-match", "if-modified-since"];

export async function proxyToApi(req: NextRequest, prefix: string, path: string[] = []) {
  const target =
    `${API_ORIGIN}/${prefix}` +
    (path.length ? `/${path.map(encodeURIComponent).join("/")}` : "") +
    req.nextUrl.search;

  const uncacheable = prefix === "api";

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP.has(key)) headers.set(key, value);
  });
  if (uncacheable) for (const h of CONDITIONAL) headers.delete(h);

  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP.has(key) && key !== "set-cookie") respHeaders.set(key, value);
  });
  // set-cookie must be copied per value: Headers.forEach folds multiple
  // cookies into one comma-joined string, which browsers misparse.
  for (const cookie of upstream.headers.getSetCookie()) {
    respHeaders.append("set-cookie", cookie);
  }
  if (uncacheable) {
    respHeaders.delete("etag");
    respHeaders.delete("last-modified");
    respHeaders.set("cache-control", "no-store");
  }

  const buf = await upstream.arrayBuffer();
  return new Response(NULL_BODY_STATUSES.includes(upstream.status) ? null : buf, {
    status: upstream.status,
    headers: respHeaders,
  });
}
