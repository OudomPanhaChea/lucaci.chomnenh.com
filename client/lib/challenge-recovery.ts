// Recovery from Hostinger's edge bot challenge (/hcdn-cgi/jschallenge) landing
// on a request that cannot solve it. The challenge is a JS interstitial: a
// full document navigation runs it and earns a per-origin clearance cookie,
// but an XHR, an RSC fetch or a <script> chunk just receives the 403 HTML and
// dies. When we detect that, the fix IS a document load — so reload, once.
// The POS cart survives reloads (lib/pos-cart), so this trades a visible
// refresh for a silently broken page.
//
// Two guards against a reload loop (a challenge the reload cannot clear, e.g.
// the document itself keeps failing): an in-memory timestamp (always works)
// and sessionStorage (survives the reload itself, which resets module state).
const KEY = "chomnenh:challenge-reload";
const MIN_INTERVAL_MS = 60_000;

let lastInMemory = 0;

export function reloadOnceForChallenge(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastInMemory < MIN_INTERVAL_MS) return;
  lastInMemory = now;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (now - last < MIN_INTERVAL_MS) return;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Private mode: the in-memory guard above still prevents same-page loops.
  }
  window.location.reload();
}

/** The edge challenge is 403 HTML mentioning its own /hcdn-cgi/ endpoints.
 *  Our API never answers 403 with HTML, so this cannot match real app output. */
export function looksLikeEdgeChallenge(status: number | undefined, body: unknown): boolean {
  return (
    status === 403 &&
    typeof body === "string" &&
    (body.includes("hcdn-cgi") || body.includes("jschallenge"))
  );
}
