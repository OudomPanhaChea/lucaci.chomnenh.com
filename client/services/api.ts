import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { looksLikeEdgeChallenge, reloadOnceForChallenge } from "@/lib/challenge-recovery";

// Same-origin: next.config.ts rewrites /api → Express in dev; nginx does it
// in production. The JWT lives in an httpOnly cookie.
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  // A request that hangs (shared-hosting cold start, edge challenge eating the
  // connection) must eventually fail so the UI can react; without this the
  // login button spins forever. Generous enough for a 5MB image upload.
  timeout: 30000,
});

// Hostinger's edge intermittently strips the body from responses crossing the
// api-lucaci hop and rewrites Content-Length to 0, keeping status 200 and every
// other header (verified live 2026-07-17, in bursts up to 1 in 3 requests).
// Our API never sends an empty 200 JSON body, so this is always the edge, and
// letting it resolve hands callers `undefined` where data should be: /auth/me
// "succeeds" with no user and the admin layout kicks staff to /login mid-shift.
function isBodyStripped(response: AxiosResponse): boolean {
  return (
    response.status === 200 &&
    String(response.headers?.["content-type"] || "").includes("application/json") &&
    (response.data === "" || response.data == null)
  );
}

type RetriableConfig = InternalAxiosRequestConfig & { _strippedRetries?: number };

api.interceptors.response.use((response) => {
  if (!isBodyStripped(response)) return response;
  const cfg = response.config as RetriableConfig;
  const attempt = cfg._strippedRetries ?? 0;
  // The fault is transient, so a GET can simply be asked again. Non-GETs are
  // NOT auto-retried: the request may well have succeeded server-side (the
  // body vanished on the way back), and replaying a checkout would sell twice.
  // They reject instead, so callers show their normal error path rather than
  // crashing on missing data.
  if ((cfg.method || "get").toLowerCase() === "get" && attempt < 2) {
    cfg._strippedRetries = attempt + 1;
    return new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1))).then(() =>
      api.request(cfg),
    );
  }
  return Promise.reject(
    Object.assign(new Error("The server returned an empty response, please try again"), {
      isBodyStripped: true,
      config: cfg,
    }),
  );
});

// When the edge bot challenge answers an API call (403 HTML — an XHR can never
// solve it), every request is dead until a document load re-earns clearance,
// so trigger that reload rather than leaving a page that silently cannot load
// data. The request still rejects normally either way.
api.interceptors.response.use(undefined, (err) => {
  if (looksLikeEdgeChallenge(err?.response?.status, err?.response?.data)) {
    reloadOnceForChallenge();
  }
  return Promise.reject(err);
});

export function apiError(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string })?.message || fallback;
  }
  return fallback;
}

export default api;
