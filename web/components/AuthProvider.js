"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearSession,
  fetchMe,
  getStoredSession,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  signup as apiSignup,
  storeSession,
} from "../lib/auth";
import { runFullSync } from "../lib/sync";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [hasPassword, setHasPassword] = useState(false);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const session = getStoredSession();
      if (!session?.access_token && !session?.refresh_token) {
        setUser(null);
        return;
      }
      if (!session.access_token && session.refresh_token) {
        await refreshSession();
      }
      const me = await fetchMe();
      setUser(me.user || null);
      setProviders(me.providers || []);
      setHasPassword(Boolean(me.has_password));
      if (me.user) {
        storeSession({ user: me.user });
        runFullSync().catch(() => {});
      }
    } catch {
      clearSession();
      setUser(null);
      setProviders([]);
      setHasPassword(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = useCallback(async ( creds) => {
    const data = await apiLogin(creds);
    setUser(data.user || null);
    await hydrate();
    return data;
  }, [hydrate]);

  const signup = useCallback(async (creds) => {
    const data = await apiSignup(creds);
    setUser(data.user || null);
    await hydrate();
    return data;
  }, [hydrate]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setProviders([]);
    setHasPassword(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      providers,
      hasPassword,
      login,
      signup,
      logout,
      refresh: hydrate,
      isSignedIn: Boolean(user),
    }),
    [user, loading, providers, hasPassword, login, signup, logout, hydrate]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
