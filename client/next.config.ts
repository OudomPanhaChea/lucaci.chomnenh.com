import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:5001";

const nextConfig: NextConfig = {
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
