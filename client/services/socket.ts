"use client";
import { io, Socket } from "socket.io-client";

// One shared socket for all admin pages. Token comes from /auth/me (the
// cookie is httpOnly so the handshake carries the token explicitly).
let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  // When NEXT_PUBLIC_API_ORIGIN is set (production), connect straight to the
  // API host: it skips the Next.js proxy hop entirely (whose trailing-slash
  // redirect broke polling on Hostinger) and lets the websocket upgrade work.
  // The token rides the handshake, so cross-origin needs no cookie.
  // Default transports (polling first, upgrade to websocket): forcing
  // websocket-first never connected in dev because Next.js rewrites can't
  // proxy the websocket upgrade, so the header pill always showed Offline.
  const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
  socket = apiOrigin
    ? io(apiOrigin, { auth: { token }, withCredentials: true })
    : io({ auth: { token } });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
