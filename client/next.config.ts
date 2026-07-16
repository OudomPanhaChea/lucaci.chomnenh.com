import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:5001";

const nextConfig: NextConfig = {
  // Socket.IO always requests /socket.io/?EIO=4... with a trailing slash;
  // in production Next 308-redirects that to /socket.io?... BEFORE the
  // rewrite runs, which breaks the polling handshake (header stuck Offline).
  skipTrailingSlashRedirect: true,
  // Same-origin path routing (like production behind nginx): /api and
  // /uploads proxy to the Express server, so cookies just work.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
      { source: "/socket.io/:path*", destination: `${API_ORIGIN}/socket.io/:path*` },
    ];
  },
  async headers() {
    return [
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
