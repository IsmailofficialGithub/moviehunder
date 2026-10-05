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
import { ensureUserStorage, handleLogoutCleanup, runFullSync } from "../lib/sync";
import { syncGuestHistoryToServer } from "../lib/guestHistory";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [subscription, setSubscription] = useState(null);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const session = getStoredSession();
      if (!session?.access_token && !session?.refresh_token) {
        setUser(null);
        setHasActivePlan(false);
        setSubscription(null);
        return null;
      }
      if (!session.access_token && session.refresh_token) {
        await refreshSession();
      }
      const me = await fetchMe();
      setUser(me.user || null);
      setProviders(me.providers || []);
      setHasPassword(Boolean(me.has_password));
      setHasActivePlan(Boolean(me.hasActivePlan));
      setSubscription(me.subscription || null);
      if (me.user) {
        storeSession({ user: me.user });
        ensureUserStorage(me.user.id);
        syncGuestHistoryToServer().then(() => runFullSync()).catch(() => {});
      }
      return me;
    } catch {
      clearSession();
      handleLogoutCleanup(null);
      setUser(null);
      setProviders([]);
      setHasPassword(false);
      setHasActivePlan(false);
      setSubscription(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = useCallback(async (creds) => {
    const data = await apiLogin(creds);
    setUser(data.user || null);
    if (data.user?.id) ensureUserStorage(data.user.id);
    const me = await hydrate();
    return { ...data, me };
  }, [hydrate]);

  const signup = useCallback(async (creds) => {
    const data = await apiSignup(creds);
    setUser(data.user || null);
    if (data.user?.id) ensureUserStorage(data.user.id);
    const me = await hydrate();
    return { ...data, me };
  }, [hydrate]);

  const logout = useCallback(async () => {
    const currentId = user?.id;
    await apiLogout();
    handleLogoutCleanup(currentId);
    setUser(null);
    setProviders([]);
    setHasPassword(false);
    setHasActivePlan(false);
    setSubscription(null);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      providers,
      hasPassword,
      hasActivePlan,
      subscription,
      setHasActivePlan,
      setSubscription,
      login,
      signup,
      logout,
      refresh: hydrate,
      isSignedIn: Boolean(user),
    }),
    [user, loading, providers, hasPassword, hasActivePlan, subscription, login, signup, logout, hydrate]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
