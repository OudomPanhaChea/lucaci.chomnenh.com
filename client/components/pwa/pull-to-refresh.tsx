"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useFullscreen, useStandalone } from "@/hooks/useFullscreen";

// Pull-to-refresh for the two contexts that have no browser chrome (installed
// PWA window, fullscreen): there is no refresh button there, so dragging down
// from the top of the page is the only "reload" gesture staff know from native
// apps. Deliberately NOT enabled in a normal browser tab, which has its own
// refresh button and (on Android) its own native pull-to-refresh; doubling
// either would cause accidental reloads.
const START_SLOP = 10; // raw px of downward travel before a pull is committed
const RESISTANCE = 0.4; // applied = raw * this, so the chip lags the finger
const THRESHOLD = 60; // applied px that arm the release
const MAX_PULL = 90;

// Touches inside floating layers never mean "reload the page".
const OVERLAY_SELECTOR =
  ".ant-modal-root, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .Toastify";

// A pull inside a list the user has already scrolled means "scroll back up",
// so only touches whose every scrollable ancestor sits at its top qualify.
function insideScrolledContainer(el: Element | null): boolean {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

export default function PullToRefresh() {
  const standalone = useStandalone();
  const { active: fullscreen } = useFullscreen();
  const enabled = standalone || fullscreen;

  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const track = useRef<{ x: number; y: number; pulling: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Kill the browser's own overscroll glow / native pull-to-refresh while
    // ours is active, so one gesture cannot trigger two reload behaviours.
    const root = document.documentElement;
    const prevOverscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";

    const setPulled = (px: number) => {
      pullRef.current = px;
      setPull(px);
    };

    const onStart = (e: TouchEvent) => {
      track.current = null;
      if (refreshingRef.current || e.touches.length !== 1) return;
      if ((document.scrollingElement?.scrollTop ?? 0) > 0) return;
      const target = e.touches[0].target as Element | null;
      if (target?.closest?.(OVERLAY_SELECTOR)) return;
      if (insideScrolledContainer(target)) return;
      track.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, pulling: false };
    };

    const onMove = (e: TouchEvent) => {
      const s = track.current;
      if (!s || refreshingRef.current) return;
      const t = e.touches[0];
      const dy = t.clientY - s.y;
      const dx = t.clientX - s.x;
      if (!s.pulling) {
        // Commit only to a clearly downward drag; anything else (scroll up,
        // horizontal swipe) is someone else's gesture.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
          track.current = null;
          return;
        }
        if (dy < START_SLOP) return;
        if ((document.scrollingElement?.scrollTop ?? 0) > 0) {
          track.current = null;
          return;
        }
        s.pulling = true;
        setDragging(true);
      }
      if (e.cancelable) e.preventDefault(); // stop the iOS rubber-band fighting the chip
      setPulled(Math.min(MAX_PULL, Math.max(0, dy - START_SLOP) * RESISTANCE));
    };

    const onEnd = () => {
      const s = track.current;
      track.current = null;
      if (!s?.pulling) return;
      setDragging(false);
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        // Cart and session both survive a reload (lib/pos-cart, cookie).
        window.location.reload();
      } else {
        setPulled(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.style.overscrollBehaviorY = prevOverscroll;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  if (!enabled) return null;

  const visible = pull > 0 || refreshing;
  const armed = refreshing || pull >= THRESHOLD;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translateY(${(refreshing ? THRESHOLD : pull) - 44}px)`,
        opacity: visible ? 1 : 0,
        transition: dragging ? "none" : "transform 200ms ease, opacity 200ms ease",
      }}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors duration-200 ${
          armed
            ? "border-brand bg-brand text-brand-foreground"
            : "border-line bg-surface-raised text-fg-muted"
        }`}
      >
        <RefreshCw
          className={`h-4.5 w-4.5 ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </span>
    </div>
  );
}
