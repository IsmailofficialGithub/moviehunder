"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  linkGoogle,
  resendVerification,
  setPassword,
} from "../lib/auth";
import styles from "../app/settings/settings.module.css";
import authStyles from "../app/login/auth.module.css";

export default function AccountSettings() {
  const { user, loading, logout, providers, hasPassword, hasActivePlan, subscription, refresh } = useAuth();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Account</h2>
        <div className={styles.panel}>
          <div className={styles.row}>
            <p className={styles.rowHint}>Loading…</p>
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className={styles.group} aria-labelledby="settings-account">
        <h2 id="settings-account" className={styles.groupTitle}>
          Account
        </h2>
        <div className={styles.panel}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Guest mode</p>
              <p className={styles.rowHint}>
                Sign in to sync watch progress across devices
              </p>
            </div>
            <Link href="/login" className={styles.rowLink}>
              Sign in
            </Link>
          </div>
        </div>
      </section>
    );
  }

  async function onResend() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await resendVerification();
      setMsg("Verification email sent");
    } catch (e) {
      setErr(e.message || "Failed to resend");
    } finally {
      setBusy(false);
    }
  }

  async function onSetPassword(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await setPassword(newPassword);
      setNewPassword("");
      setMsg("Password saved");
      await refresh();
    } catch (e2) {
      setErr(e2.message || "Failed to set password");
    } finally {
      setBusy(false);
    }
  }

  async function onLinkGoogle() {
    setErr("");
    setBusy(true);
    try {
      const data = await linkGoogle();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setErr(e.message || "Failed to link Google");
      setBusy(false);
    }
  }

  const initials = (user.display_name || user.email || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className={styles.group} aria-labelledby="settings-account">
      <h2 id="settings-account" className={styles.groupTitle}>
        Account
      </h2>
      <div className={styles.panel}>
        <div className={styles.avatarRow}>
          <div className={styles.avatar}>
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name || user.email}
                className={styles.avatarImg}
                referrerPolicy="no-referrer"
              />
            ) : (
              initials
            )}
          </div>
          <div className={styles.avatarMeta}>
            <p className={styles.avatarName}>{user.display_name || user.email}</p>
            <p className={styles.avatarEmail}>{user.email}</p>
          </div>
          <button
            type="button"
            className={styles.rowDangerBtn}
            onClick={() => logout()}
          >
            Sign out
          </button>
        </div>

        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Membership & Plan</p>
            <p className={styles.rowHint}>
              {hasActivePlan
                ? `Active (${subscription?.tier || "Standard"} Plan)`
                : "No active membership — plan required to stream"}
            </p>
          </div>
          <Link
            href="/signup/planform?step=2"
            className={styles.rowAction}
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            {hasActivePlan ? "Change Plan" : "Choose a Plan"}
          </Link>
        </div>

        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Email status</p>
            <p className={styles.rowHint}>
              {user.email_verified ? "✓ Verified" : "Not verified"}
            </p>
          </div>
          {!user.email_verified ? (
            <button
              type="button"
              className={styles.rowAction}
              disabled={busy}
              onClick={onResend}
            >
              Resend
            </button>
          ) : null}
        </div>

        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Sign-in providers</p>
            <p className={styles.rowHint}>
              {[hasPassword ? "email" : null, ...(providers || [])]
                .filter(Boolean)
                .join(", ") || "none"}
            </p>
          </div>
          {!providers?.includes("google") ? (
            <button
              type="button"
              className={styles.rowAction}
              disabled={busy}
              onClick={onLinkGoogle}
            >
              Link Google
            </button>
          ) : null}
        </div>

        {!hasPassword ? (
          <form className={styles.row} onSubmit={onSetPassword}>
            <div className={styles.rowText} style={{ flex: 1 }}>
              <p className={styles.rowLabel}>Set password</p>
              <input
                className={authStyles.input}
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ marginTop: 8 }}
                required
              />
            </div>
            <button type="submit" className={styles.rowAction} disabled={busy}>
              Save
            </button>
          </form>
        ) : null}
      </div>
      {msg ? <p className={authStyles.ok} style={{ marginTop: 12 }}>{msg}</p> : null}
      {err ? <p className={authStyles.error} style={{ marginTop: 12 }}>{err}</p> : null}
    </section>
  );
}
