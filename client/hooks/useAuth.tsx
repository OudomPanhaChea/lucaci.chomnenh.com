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
    const { data } = await api.post("/auth/login", { email, password });
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
