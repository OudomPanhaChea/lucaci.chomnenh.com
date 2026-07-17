// Runs once in EVERY Next server process at startup (the Next instrumentation
// hook). The API_ORIGIN_PIN_IP DNS pin lives here and NOT in next.config.ts:
// on Hostinger the config's output is baked at build time and the file is not
// re-evaluated by the serving process (verified via /pin-status on 2026-07-17,
// pin_ran_in_this_process stayed false), so config side effects silently never
// happen in production. register() is the sanctioned place for process-level
// setup and provably runs where the rewrite proxy runs.
//
// What the pin does: resolves the API hostname to the origin server's IP so
// the server-to-server rewrite hop (/api, /uploads, /socket.io) stops
// transiting Hostinger's hCDN edge a second time. That second transit is
// where the edge answered with an unsolvable bot challenge and intermittently
// stripped response bodies (200 + Content-Length: 0). TLS, SNI and cert
// validation are unchanged (the cert really is for the hostname), so a stale
// pin IP fails loudly instead of silently hitting the wrong app.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const apiOrigin = process.env.API_ORIGIN;
  const pinIp = process.env.API_ORIGIN_PIN_IP;
  // Only engage for an explicitly configured, non-local API origin: a local
  // `next start` (which also loads .env.production and its pin IP) must never
  // pin the default localhost API to the production server.
  if (!apiOrigin || !pinIp) return;
  const pinnedHost = new URL(apiOrigin).hostname;
  if (["localhost", "127.0.0.1"].includes(pinnedHost)) return;

  const dns = (await import("node:dns")).default;
  type LookupCb = (err: unknown, address: unknown, family?: number) => void;
  const realLookup = dns.lookup.bind(dns);
  // net/tls/undici read dns.lookup per connection, so patching the module
  // object covers the rewrite proxy and every server-side fetch.
  (dns as { lookup: unknown }).lookup = (
    hostname: string,
    options: unknown,
    callback?: LookupCb,
  ) => {
    if (hostname !== pinnedHost) {
      return realLookup(hostname, options as never, callback as never);
    }
    let cb = callback;
    if (typeof options === "function") {
      cb = options as LookupCb;
      options = undefined;
    }
    if (options && (options as { all?: boolean }).all) {
      return cb!(null, [{ address: pinIp, family: 4 }]);
    }
    return cb!(null, pinIp, 4);
  };
  (globalThis as { __apiPinActive?: boolean }).__apiPinActive = true;
  console.log(`[api-pin] resolving ${pinnedHost} -> ${pinIp}`);
}
