import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:5001";

// The API_ORIGIN_PIN_IP DNS pin lives in instrumentation.ts, NOT here: on
// Hostinger this file's output is baked at build and the file is not
// re-evaluated by the serving process (verified via /pin-status 2026-07-17),
// so side effects here silently never happen in production. pinEngaged is
// computed for the x-pin-state diagnostic header only.
const pinEngaged = Boolean(
  process.env.API_ORIGIN_PIN_IP &&
    process.env.API_ORIGIN &&
    !["localhost", "127.0.0.1"].includes(new URL(API_ORIGIN).hostname),
);

const nextConfig: NextConfig = {
  // Socket.IO always requests /socket.io/?EIO=4... with a trailing slash;
  // in production Next 308-redirects that to /socket.io?... BEFORE the
  // rewrite runs, which breaks the polling handshake (header stuck Offline).
  skipTrailingSlashRedirect: true,
  // Same-origin path routing. /api and /uploads are served by buffering route
  // handlers (app/api/[...path], app/uploads/[...path] -> lib/api-proxy.ts),
  // NOT rewrites: on Hostinger, bodies streamed through the rewrite proxy are
  // dropped 30-45% of the time (2026-07-17). Only Socket.IO stays on the
  // rewrite; its long-poll transport recovers from a lost body on its own,
  // and a route handler cannot reliably serve the /socket.io/ trailing-slash
  // form the client uses.
  async rewrites() {
    return [
      { source: "/socket.io/:path*", destination: `${API_ORIGIN}/socket.io/:path*` },
    ];
  },
  async headers() {
    return [
      {
        // Externally visible pin diagnostic (baked at build, where the env
        // matches runtime on hPanel): lets us see from outside whether the
        // DNS pin engaged, since a silently-off pin is otherwise identical
        // to a working one except for doubled x-hcdn headers on /api.
        source: "/login",
        headers: [{ key: "x-pin-state", value: pinEngaged ? "on" : "off" }],
      },
      {
        // The service worker script itself must never be held by a cache, or a
        // deployed fix to sw.js would not reach tablets that already have the
        // old one. Service-Worker-Allowed lets it claim the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      // No Vary rule here on purpose: Next already sets its own
      // `Vary: rsc, next-router-state-tree, ...` on every route and overrides
      // anything configured here (verified locally). Hostinger's proxy rewrites
      // that down to `Vary: Accept-Encoding` before it reaches hCDN, which is
      // why the HTML/RSC cache poisoning happened at all — so `no-store` (via
      // force-dynamic in app/layout.tsx) is the protection that actually holds.
    ];
  },
};

export default nextConfig;
