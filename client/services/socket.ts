"use client";
import { io, Socket } from "socket.io-client";

// One shared socket for all admin pages. Token comes from /auth/me (the
// cookie is httpOnly so the handshake carries the token explicitly).
let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  // Default transports (polling first, upgrade to websocket): forcing
  // websocket-first never connected in dev because Next.js rewrites can't
  // proxy the websocket upgrade, so the header pill always showed Offline.
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
