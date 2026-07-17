"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import api from "@/services/api";
import { connectSocket, disconnectSocket } from "@/services/socket";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** The session could not be checked because the server is unreachable, and we
   *  are retrying. Distinct from `loading`: this is not a normal startup wait,
   *  so the UI should say so rather than spin silently. */
  reconnecting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Only a 401 means "not signed in". Anything else (no response at all, or a
    // 5xx while the origin cold-starts) means we could not ASK — which is not
    // the same answer and must never be treated as one: admin/layout redirects
    // on `!loading && !user`, so swallowing a network blip here used to log
    // staff out and take an in-progress cart with it. Stay loading and retry;
    // the session cookie is still perfectly valid.
    const load = (attempt = 0) => {
      api
        .get("/auth/me")
        .then(({ data }) => {
          if (cancelled) return;
          // A 200 with no user in it is a mangled response (the edge has been
          // seen stripping bodies), not an answer: a real signed-out session
          // gets a 401. Treat it like the network errors below, never as
          // "logged out" — that wipes a valid session and the cart with it.
          if (!data?.user) {
            setReconnecting(true);
            timer = setTimeout(() => load(attempt + 1), Math.min(1000 * 2 ** attempt, 10000));
            return;
          }
          setUser(data.user);
          if (data.token) connectSocket(data.token);
          setReconnecting(false);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err?.response?.status === 401) {
            setReconnecting(false);
            setLoading(false); // a real answer: signed out
            return;
          }
          setReconnecting(true);
          timer = setTimeout(() => load(attempt + 1), Math.min(1000 * 2 ** attempt, 10000));
        });
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const attempt = () => api.post("/auth/login", { email, password });
    let data;
    try {
      ({ data } = await attempt());
    } catch (err: unknown) {
      // Only retry when the server never actually answered the question: no
      // response at all (blip, timeout), a 502/503/504 from Hostinger's proxy
      // while the app cold-starts, or a 403 (the edge's bot challenge, which an
      // XHR cannot solve — our API never 403s a login). This is the machine
      // pressing "Log in" the second time so the user doesn't have to. A real
      // 400/401/429 is an answer and is re-thrown untouched, so wrong passwords
      // still fail once and still count toward the rate limit exactly once.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status && ![403, 502, 503, 504].includes(status)) throw err;
      await new Promise((r) => setTimeout(r, 1500));
      ({ data } = await attempt());
    }
    // Same stripped-body guard as the session check: a "successful" login with
    // no user would leave the form silently stuck.
    if (!data?.user) throw new Error("Login did not complete, please try again");
    setUser(data.user);
    if (data.token) connectSocket(data.token);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      disconnectSocket();
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  const updateUser = useCallback((next: User) => setUser(next), []);

  return (
    <AuthContext.Provider value={{ user, loading, reconnecting, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
