"use client";
import { useCallback, useSyncExternalStore } from "react";

// Safari on iPadOS only exposed the prefixed API until 16.4, and iPhone Safari
// exposes neither (there, installing the PWA is the only way to lose the
// browser chrome). Everything below degrades to "unsupported" in that case.
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const currentElement = () => {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

const subscribe = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
};

const emptySubscribe = () => () => {};
const serverFalse = () => false;

export function useFullscreen() {
  const active = useSyncExternalStore(
    subscribe,
    () => currentElement() !== null,
    serverFalse,
  );
  // Support never changes after load, so it needs no subscription — only the
  // server/client split, which is why it still goes through the store.
  const supported = useSyncExternalStore(
    emptySubscribe,
    () => {
      const doc = document as FullscreenDocument;
      return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
    },
    serverFalse,
  );

  const toggle = useCallback(async () => {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    try {
      if (currentElement()) {
        await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
      } else {
        await (root.requestFullscreen
          ? root.requestFullscreen({ navigationUI: "hide" })
          : root.webkitRequestFullscreen?.());
      }
    } catch {
      // Denied, or the gesture expired. Nothing actionable for the user.
    }
  }, []);

  return { active, supported, toggle };
}

// True when launched from the home screen / installed app window, where the
// browser chrome is already gone and a fullscreen toggle adds little.
export function useStandalone() {
  return useSyncExternalStore(
    emptySubscribe,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari does not report display-mode; it sets this instead.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    serverFalse,
  );
}
