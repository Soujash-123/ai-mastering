"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AuthUser,
  clearToken,
  fetchMe,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = new Set(["/login", "/signup"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      setUser(await fetchMe());
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    if (!user && !PUBLIC_PATHS.has(pathname)) {
      router.replace("/login");
    }
    if (user && PUBLIC_PATHS.has(pathname)) {
      router.replace("/");
    }
  }, [loading, user, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password);
    setUser(u);
    router.push("/");
  }, [router]);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const u = await apiRegister(fullName, email, password);
    setUser(u);
    router.push("/");
  }, [router]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border border-white/10 border-t-accent" />
      </div>
    );
  }

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border border-white/10 border-t-accent" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      loading: true,
      login: async () => {
        throw new Error("AuthProvider not available");
      },
      register: async () => {
        throw new Error("AuthProvider not available");
      },
      logout: async () => {},
      refresh: async () => {},
    } as AuthContextValue;
  }
  return ctx;
}
