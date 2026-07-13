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
};

export default nextConfig;
