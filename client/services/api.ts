import axios from "axios";

// Same-origin: next.config.ts rewrites /api → Express in dev; nginx does it
// in production. The JWT lives in an httpOnly cookie.
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export function apiError(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string })?.message || fallback;
  }
  return fallback;
}

export default api;
