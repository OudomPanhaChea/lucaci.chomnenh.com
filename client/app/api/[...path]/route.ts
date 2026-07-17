import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

// Buffered proxy to the Express API. Replaces the /api rewrite: see
// lib/api-proxy.ts for why (Hostinger drops streamed rewrite bodies).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

const handler = async (req: NextRequest, ctx: Ctx) =>
  proxyToApi(req, "api", (await ctx.params).path);

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};
