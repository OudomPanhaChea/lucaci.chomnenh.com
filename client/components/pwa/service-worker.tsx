"use client";
import { useEffect } from "react";
import { reloadOnceForChallenge } from "@/lib/challenge-recovery";

// Registers /public/sw.js (offline fallback + immutable asset caching).
// Production only: in dev the worker would cache dev chunks and shadow edits.
export default function ServiceWorkerRegistrar() {
  // A build chunk that fails to load leaves the page half-dead (a click does
  // nothing because its handler never arrived). The usual cause here is the
  // edge challenge 403ing a <script> — same recovery as an API challenge: one
  // document reload re-earns clearance AND re-requests the chunk. Covers both
  // dynamic-import rejections and <script> tag load errors.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const onRejection = (event: PromiseRejectionEvent) => {
      const msg = String((event.reason as Error)?.message || event.reason || "");
      const name = String((event.reason as Error)?.name || "");
      if (name === "ChunkLoadError" || /Failed to load chunk|Loading chunk .* failed/i.test(msg)) {
        reloadOnceForChallenge();
      }
    };
    const onResourceError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "SCRIPT" &&
        (target as HTMLScriptElement).src.includes("/_next/static/")
      ) {
        reloadOnceForChallenge();
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onResourceError, true); // resource errors don't bubble
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onResourceError, true);
    };
  }, []);

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
