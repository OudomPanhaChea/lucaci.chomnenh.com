"use client";
import { io, Socket } from "socket.io-client";

// One shared socket for all admin pages. Token comes from /auth/me (the
// cookie is httpOnly so the handshake carries the token explicitly).
let socket: Socket | null = null;

// socket.io's own reconnect backoff is enough on a desktop, but a POS tablet
// sleeps: iOS/Android freeze JS timers in a backgrounded PWA, so on wake the
// next retry can still be tens of seconds away and the pill sits on Offline
// while the shop is already selling. Poke the socket the moment the app is
// visible again (or the network returns) so reconnection starts immediately.
let resumeWired = false;
function wireResumeReconnect() {
  if (resumeWired || typeof window === "undefined") return;
  resumeWired = true;
  const poke = () => {
    if (socket && !socket.connected && document.visibilityState === "visible") {
      socket.connect();
    }
  };
  document.addEventListener("visibilitychange", poke);
  window.addEventListener("online", poke);
  window.addEventListener("focus", poke);
  window.addEventListener("pageshow", poke); // bfcache restore never fires the others
}

export function connectSocket(token: string): Socket {
  wireResumeReconnect();
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
  // reconnection is on by default (infinite attempts); cap the backoff so a
  // tablet that was asleep never sits on a 20s+ retry delay after waking.
  socket = io({ auth: { token }, reconnectionDelayMax: 5000 });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
