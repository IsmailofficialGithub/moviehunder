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
  getSession,
  hydrateAuthSession,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  signup as apiSignup,
  storeSession,
} from "./auth";
import { ensureUserStorageMobile, runFullSync } from "./sync";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [hasPassword, setHasPassword] = useState(false);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateAuthSession();
      const session = getSession();
      if (!session.access_token && !session.refresh_token) {
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
        await storeSession({ user: me.user });
        await ensureUserStorageMobile(me.user.id);
        runFullSync().catch(() => {});
      }
    } catch {
      await clearSession();
      await ensureUserStorageMobile(null);
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

  const login = useCallback(
    async (creds) => {
      const data = await apiLogin(creds);
      setUser(data.user || null);
      if (data.user?.id) await ensureUserStorageMobile(data.user.id);
      await hydrate();
      return data;
    },
    [hydrate]
  );

  const signup = useCallback(
    async (creds) => {
      const data = await apiSignup(creds);
      setUser(data.user || null);
      if (data.user?.id) await ensureUserStorageMobile(data.user.id);
      await hydrate();
      return data;
    },
    [hydrate]
  );

  const logout = useCallback(async () => {
    await apiLogout();
    await ensureUserStorageMobile(null);
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
