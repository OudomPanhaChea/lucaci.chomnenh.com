"use client";
import { useEffect, useRef } from "react";
import { getSocket } from "@/services/socket";

// Subscribe to realtime events and re-run the handler when any of them fire.
// The handler ref pattern keeps the socket listeners stable across renders.
export function useRealtime(events: string[], handler: (event: string, payload?: unknown) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const listeners = events.map((event) => {
      const fn = (payload: unknown) => handlerRef.current(event, payload);
      socket.on(event, fn);
      return [event, fn] as const;
    });
    return () => {
      listeners.forEach(([event, fn]) => socket.off(event, fn));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join(",")]);
}
