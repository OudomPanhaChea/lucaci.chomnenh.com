"use client";
import { io, Socket } from "socket.io-client";

// One shared socket for all admin pages. Token comes from /auth/me (the
// cookie is httpOnly so the handshake carries the token explicitly).
let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  // Same-origin ALWAYS, through the Next rewrite (2026-07-16, reversing the
  // 2026-07-13 direct-to-API connection). Hostinger's hCDN bot challenge is
  // scored per origin and cleared by a cookie a browser can only earn by
  // NAVIGATING there — which never happens for the api subdomain, so a direct
  // connection dies permanently once challenged (the "Offline pill while data
  // loads" signature). Same-origin requests ride the clearance cookie the app
  // already has. The websocket upgrade can't cross the rewrite, so this stays
  // on long-polling — fine for a handful of users, and it's what dev always
  // did. Needs `addTrailingSlash: false` server-side (the rewrite strips the
  // trailing slash engine.io's default path requires).
  socket = io({ auth: { token } });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
