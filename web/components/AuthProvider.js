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
        ensureUserStorage(me.user.id);
        syncGuestHistoryToServer().then(() => runFullSync()).catch(() => {});
        // Auto-hydrate real active profile, cache profiles list, plan quota & preload avatars
        import("../lib/profiles.js")
          .then(async ({ fetchRemoteProfiles, switchActiveProfile, saveUserProfiles, savePlanQuota, preloadProfileAvatars, PRESET_AVATARS }) => {
            try {
              const res = await fetchRemoteProfiles();
              if (res?.profiles?.length) {
                const defaultAvatar = PRESET_AVATARS?.[0]?.url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914";
                const mapped = res.profiles.map((p) => ({
                  id: p.id,
                  name: p.name,
                  avatar: p.avatarUrl || defaultAvatar,
                  isKids: Boolean(p.isKids),
                  isPrimary: Boolean(p.isPrimary),
                  hasPin: Boolean(p.hasPin),
                  pin: p.hasPin ? "••••" : "",
                }));
                saveUserProfiles(me.user, mapped, true);
                preloadProfileAvatars(mapped);
                if (res.plan) {
                  savePlanQuota(res.plan);
                }
                const raw = localStorage.getItem("active_profile");
                const parsed = raw ? JSON.parse(raw) : null;
                const matchingActive = parsed ? mapped.find((p) => String(p.id) === String(parsed.id)) : null;
                const target = matchingActive || mapped.find((p) => p.isPrimary) || mapped[0];
                if (target) {
                  switchActiveProfile({
                    id: target.id,
                    name: target.name,
                    avatar: target.avatar,
                    isKids: Boolean(target.isKids),
                    isPrimary: Boolean(target.isPrimary),
                    hasPin: Boolean(target.hasPin),
                  });
                }
              }
            } catch {}
          })
          .catch(() => {});
      }
    } catch {
      clearSession();
      handleLogoutCleanup(null);
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

  const login = useCallback(async (creds) => {
    const data = await apiLogin(creds);
    setUser(data.user || null);
    if (data.user?.id) ensureUserStorage(data.user.id);
    await hydrate();
    return data;
  }, [hydrate]);

  const signup = useCallback(async (creds) => {
    const data = await apiSignup(creds);
    setUser(data.user || null);
    if (data.user?.id) ensureUserStorage(data.user.id);
    await hydrate();
    return data;
  }, [hydrate]);

  const logout = useCallback(async () => {
    const currentId = user?.id;
    await apiLogout();
    handleLogoutCleanup(currentId);
    setUser(null);
    setProviders([]);
    setHasPassword(false);
  }, [user]);

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
