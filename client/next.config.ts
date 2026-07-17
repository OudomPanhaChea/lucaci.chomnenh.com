import type { NextConfig } from "next";
import dns from "node:dns";

const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:5001";

// Optional escape hatch from Hostinger's hCDN edge on the server-to-server
// rewrite hop (set API_ORIGIN_PIN_IP in the hPanel Web app, currently
// 156.67.222.87). Every /api, /uploads and /socket.io request below is proxied
// by THIS Node process to API_ORIGIN; by default that hostname resolves to the
// hCDN anycast edge, which (a) can answer with a bot challenge no server can
// solve and (b) intermittently strips response bodies (200 + Content-Length: 0,
// verified live 2026-07-17). Pinning the lookup to the origin server's IP keeps
// the URL, SNI and certificate validation exactly as they were (the cert really
// is for this hostname), so it is a routing change, not a security downgrade.
// This file executes in the process that runs the rewrites, so patching
// dns.lookup here covers net/tls/undici. If Hostinger ever migrates the account
// to a new server, update or remove the env var; a wrong IP fails loudly
// (connection refused / cert mismatch), it cannot silently hit the wrong app.
// The pin only engages when API_ORIGIN is explicitly configured (hPanel sets
// it; local dev/start does not): .env.production carries the pin IP, and
// without this guard a local `next start` would pin the default localhost
// API_ORIGIN to the production server, silently pointing local tests at prod.
const PIN_IP = process.env.API_ORIGIN_PIN_IP;
const pinEngaged = Boolean(
  PIN_IP &&
    process.env.API_ORIGIN &&
    !["localhost", "127.0.0.1"].includes(new URL(API_ORIGIN).hostname),
);
if (pinEngaged) {
  console.log(`[api-pin] resolving ${new URL(API_ORIGIN).hostname} -> ${PIN_IP}`);
  // Runtime marker for /pin-status: proves THIS process ran the pin block
  // (config could be evaluated in a different process than the one serving).
  (globalThis as { __apiPinActive?: boolean }).__apiPinActive = true;
  const pinnedHost = new URL(API_ORIGIN).hostname;
  const realLookup = dns.lookup.bind(dns);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dns as { lookup: any }).lookup = (hostname: string, options: any, callback?: any) => {
    if (hostname !== pinnedHost) return realLookup(hostname, options, callback);
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (options && options.all) return callback(null, [{ address: PIN_IP, family: 4 }]);
    return callback(null, PIN_IP, 4);
  };
}

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
