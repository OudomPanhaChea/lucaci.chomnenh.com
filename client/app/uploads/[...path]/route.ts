import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

// Buffered proxy for stored images and legacy upload files. Replaces the
// /uploads rewrite: see lib/api-proxy.ts for why (Hostinger drops streamed
// rewrite bodies, and the SW caches images cache-first, so a dropped body
// would otherwise become a permanently broken product photo).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

const handler = async (req: NextRequest, ctx: Ctx) =>
  proxyToApi(req, "uploads", (await ctx.params).path);

export { handler as GET, handler as HEAD };
