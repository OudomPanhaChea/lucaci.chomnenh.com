"use client";
import { useEffect } from "react";

// Registers /public/sw.js (offline fallback + immutable asset caching).
// Production only: in dev the worker would cache dev chunks and shadow edits.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration fails on unsupported/private-mode browsers. The app
        // works fine without it, so there is nothing to tell the user.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
