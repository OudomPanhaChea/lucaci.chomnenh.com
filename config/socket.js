import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io = null;

// Realtime events broadcast to every authenticated admin tab:
//   sale:created / sale:voided   → dashboard, invoices, reports refresh
//   product:changed              → inventory, POS grid, public menu refresh
//   client:changed               → clients page refresh
//   settings:changed             → header / menu re-read settings
export function initSocket(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    // Token comes from the auth handshake (client reads it from /auth/me).
    const token =
      socket.handshake.auth?.token ||
      parseCookie(socket.handshake.headers.cookie || "", "chamnenh_token");
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join("admins");
  });

  return io;
}

export function emitToAdmins(event, payload) {
  if (io) io.to("admins").emit(event, payload);
}

function parseCookie(header, name) {
  const match = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}
