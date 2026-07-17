import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Ops diagnostic for the API_ORIGIN_PIN_IP DNS pin (see next.config.ts): a
// silently-off pin is indistinguishable from a working one except for doubled
// x-hcdn headers on /api, so this reports, from INSIDE the serving process:
// whether the pin env vars are visible, whether this process actually ran the
// pin block, and what a server-side fetch to the API sees (Server: LiteSpeed
// means the edge was bypassed; Server: hcdn means it was not). Exposes no
// secrets: just env presence and response metadata of a public endpoint.
export async function GET() {
  const apiOrigin = process.env.API_ORIGIN || null;
  let upstream: Record<string, unknown>;
  try {
    const res = await fetch(`${apiOrigin || "http://localhost:5001"}/api/health`, {
      cache: "no-store",
    });
    upstream = {
      status: res.status,
      server: res.headers.get("server"),
      hcdn_status: res.headers.get("x-hcdn-cache-status"),
      body_bytes: (await res.text()).length,
    };
  } catch (err) {
    upstream = { error: String(err) };
  }
  return NextResponse.json({
    api_origin: apiOrigin,
    pin_ip: process.env.API_ORIGIN_PIN_IP || null,
    pin_ran_in_this_process:
      (globalThis as { __apiPinActive?: boolean }).__apiPinActive === true,
    upstream,
  });
}
