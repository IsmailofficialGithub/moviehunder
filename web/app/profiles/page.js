"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useCallback } from "react";
import { Plus, Check, Pencil, Lock, Trash2, X, KeyRound, Mail, ArrowRight } from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import {
  PRESET_AVATARS,
  MAX_PROFILES,
  loadUserProfiles,
  saveUserProfiles,
  getActiveProfileId,
  switchActiveProfile,
  fetchRemoteProfiles,
  createRemoteProfile,
  updateRemoteProfile,
  deleteRemoteProfile,
  switchRemoteProfile,
  forgotRemoteProfilePin,
  resetRemoteProfilePin,
} from "../../lib/profiles";
import styles from "./profiles.module.css";

function ProfilesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isSignedIn } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState("1");
  const [isManaging, setIsManaging] = useState(false);
  const [planQuota, setPlanQuota] = useState(null);

  // Add / Edit Modal state
  const [modalMode, setModalMode] = useState(null); // null | "add" | "edit"
  const [formProfile, setFormProfile] = useState({
    id: null,
    name: "",
    avatar: PRESET_AVATARS[0].url,
    isKids: false,
    pin: "",
    pinEnabled: false,
    hadExistingPin: false,
    oldPin: "",
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PIN Unlock Modal state
  const [unlockTarget, setUnlockTarget] = useState(null); // profile object or null
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Forgot PIN Modal state
  const [forgotModal, setForgotModal] = useState({
    isOpen: false,
    profile: null,
    email: "",
    resetCode: "",
    newPin: "",
    error: "",
    success: "",
    loading: false,
    step: "request", // "request" | "reset"
  });

  const refreshProfiles = useCallback(async () => {
    if (isSignedIn) {
      try {
        const data = await fetchRemoteProfiles();
        if (data && Array.isArray(data.profiles)) {
          const mapped = data.profiles.map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatarUrl || PRESET_AVATARS[0].url,
            isKids: Boolean(p.isKids),
            isPrimary: Boolean(p.isPrimary),
            hasPin: Boolean(p.hasPin),
            pin: p.hasPin ? "••••" : "",
          }));
          setProfiles(mapped);
          if (data.plan) setPlanQuota(data.plan);
          saveUserProfiles(user, mapped, false);

          const activeId = getActiveProfileId();
          setActiveProfileId(activeId);
          return { list: mapped, activeId };
        }
      } catch (err) {
        console.warn("[profiles] remote load fallback:", err);
      }
    }

    const list = loadUserProfiles(user);
    setProfiles(list);
    const activeId = getActiveProfileId();
    setActiveProfileId(activeId);
    return { list, activeId };
  }, [user, isSignedIn]);

  useEffect(() => {
    refreshProfiles().then(({ list }) => {
      // Check if redirected with ?unlock=<id>
      const unlockId = searchParams?.get("unlock");
      if (unlockId) {
        const target = list.find((p) => String(p.id) === String(unlockId));
        if (target) {
          if (target.hasPin || (target.pin && target.pin.trim().length > 0)) {
            setUnlockTarget(target);
            setUnlockPin("");
            setUnlockError("");
          } else {
            selectProfile(target);
          }
        }
      }
    });

    const onProfileChange = (e) => {
      if (e?.detail?.id) {
        setActiveProfileId(String(e.detail.id));
      }
    };
    window.addEventListener("mh:profile:change", onProfileChange);
    return () => {
      window.removeEventListener("mh:profile:change", onProfileChange);
    };
  }, [refreshProfiles, searchParams]);

  const selectProfile = (profile) => {
    setActiveProfileId(profile.id);
    switchActiveProfile(profile);
    router.push("/");
  };

  const handleProfileClick = async (profile) => {
    if (isManaging) {
      // Open edit modal
      setFormProfile({
        id: profile.id,
        name: profile.name || "",
        avatar: profile.avatar || PRESET_AVATARS[0].url,
        isKids: !!profile.isKids,
        pin: "",
        pinEnabled: !!(profile.hasPin || profile.pin),
        hadExistingPin: !!(profile.hasPin || profile.pin),
        oldPin: "",
      });
      setFormError("");
      setModalMode("edit");
      return;
    }

    // Normal watch selection: check for PIN protection
    if (profile.hasPin || (profile.pin && profile.pin.trim().length > 0)) {
      setUnlockTarget(profile);
      setUnlockPin("");
      setUnlockError("");
      return;
    }

    if (isSignedIn) {
      try {
        await switchRemoteProfile(profile.id);
      } catch (err) {
        console.warn("[switch] remote switch error:", err);
      }
    }

    selectProfile(profile);
  };

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    if (!unlockTarget || isUnlocking) return;

    setIsUnlocking(true);
    setUnlockError("");

    if (isSignedIn) {
      try {
        const res = await switchRemoteProfile(unlockTarget.id, { pin: unlockPin.trim() });
        setIsUnlocking(false);
        const target = unlockTarget;
        setUnlockTarget(null);
        setUnlockPin("");
        setUnlockError("");
        selectProfile(res.activeProfile || target);
        return;
      } catch (err) {
        setIsUnlocking(false);
        const remaining = err.data?.attemptsRemaining;
        const msg = err.data?.error || err.message;
        setUnlockError(
          remaining !== undefined
            ? `Incorrect PIN (${remaining} attempts remaining)`
            : msg || "Incorrect PIN. Please try again."
        );
        return;
      }
    }

    // Local fallback check
    if (unlockPin.trim() === unlockTarget.pin.trim()) {
      setIsUnlocking(false);
      const target = unlockTarget;
      setUnlockTarget(null);
      setUnlockPin("");
      setUnlockError("");
      selectProfile(target);
    } else {
      setIsUnlocking(false);
      setUnlockError("Incorrect PIN. Please try again.");
    }
  };

  const openAddProfileModal = () => {
    const limit = planQuota?.maxProfiles || MAX_PROFILES;
    if (profiles.length >= limit) {
      alert(`Plan limit reached (maximum ${limit} profiles).`);
      return;
    }
    const defaultAvatar = PRESET_AVATARS[profiles.length % PRESET_AVATARS.length].url;
    setFormProfile({
      id: null,
      name: "",
      avatar: defaultAvatar,
      isKids: false,
      pin: "",
      pinEnabled: false,
      hadExistingPin: false,
      oldPin: "",
    });
    setFormError("");
    setModalMode("add");
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError("");
    const cleanName = formProfile.name.trim() || `Profile ${profiles.length + 1}`;
    const cleanPin = formProfile.pinEnabled ? formProfile.pin.trim().slice(0, 4) : "";

    if (formProfile.pinEnabled && cleanPin.length > 0 && cleanPin.length !== 4) {
      setFormError("PIN must be exactly 4 digits.");
      return;
    }

    if (formProfile.hadExistingPin && formProfile.pinEnabled && !formProfile.oldPin.trim() && cleanPin.length > 0) {
      setFormError("Please enter your current PIN to change it.");
      return;
    }

    setIsSubmitting(true);

    if (isSignedIn) {
      try {
        if (modalMode === "add") {
          await createRemoteProfile({
            name: cleanName,
            avatarUrl: formProfile.avatar,
            isKids: formProfile.isKids,
            pin: cleanPin || null,
          });
        } else if (modalMode === "edit" && formProfile.id) {
          const payload = {
            name: cleanName,
            avatarUrl: formProfile.avatar,
            isKids: formProfile.isKids,
          };
          if (formProfile.pinEnabled) {
            if (cleanPin.length === 4) {
              payload.pin = cleanPin;
              if (formProfile.hadExistingPin) payload.oldPin = formProfile.oldPin.trim();
            }
          } else if (formProfile.hadExistingPin) {
            payload.pin = null; // Clear PIN
            payload.oldPin = formProfile.oldPin.trim();
          }
          await updateRemoteProfile(formProfile.id, payload);
        }

        setIsSubmitting(false);
        setModalMode(null);
        await refreshProfiles();
        return;
      } catch (err) {
        setIsSubmitting(false);
        setFormError(err.data?.error || err.message || "Failed to save profile.");
        return;
      }
    }

    // Local / Guest Fallback
    if (modalMode === "add") {
      const newId = String(Date.now());
      const newProfile = {
        id: newId,
        name: cleanName,
        avatar: formProfile.avatar,
        isKids: formProfile.isKids,
        pin: cleanPin,
        hasPin: Boolean(cleanPin),
      };
      const nextList = [...profiles, newProfile];
      saveUserProfiles(user, nextList);
      setProfiles(nextList);
    } else if (modalMode === "edit" && formProfile.id) {
      const nextList = profiles.map((p) => {
        if (p.id === formProfile.id) {
          return {
            ...p,
            name: cleanName,
            avatar: formProfile.avatar,
            isKids: formProfile.isKids,
            pin: cleanPin,
            hasPin: Boolean(cleanPin),
          };
        }
        return p;
      });
      saveUserProfiles(user, nextList);
      setProfiles(nextList);

      if (String(formProfile.id) === String(activeProfileId)) {
        const updatedSelf = nextList.find((p) => p.id === formProfile.id);
        if (updatedSelf) {
          switchActiveProfile(updatedSelf);
        }
      }
    }

    setIsSubmitting(false);
    setModalMode(null);
  };

  const handleDeleteProfile = async () => {
    if (!formProfile.id || profiles.length <= 1) return;
    if (formProfile.id === "1") {
      alert("Primary profile cannot be removed.");
      return;
    }
    if (!confirm(`Are you sure you want to delete profile "${formProfile.name}"?`)) return;

    if (isSignedIn) {
      try {
        await deleteRemoteProfile(formProfile.id);
        setModalMode(null);
        await refreshProfiles();
        return;
      } catch (err) {
        alert(err.data?.error || err.message || "Failed to delete profile");
        return;
      }
    }

    const nextList = profiles.filter((p) => p.id !== formProfile.id);
    saveUserProfiles(user, nextList);
    setProfiles(nextList);
    setModalMode(null);
  };

  // ── Forgot PIN Handlers ─────────────────────────────────────
  const handleStartForgotPin = (profile) => {
    if (!profile) return;
    setUnlockTarget(null); // Close unlock modal if open
    setModalMode(null); // Close edit modal if open

    setForgotModal({
      isOpen: true,
      profile,
      email: user?.email || "",
      resetCode: "",
      newPin: "",
      error: "",
      success: "",
      loading: false,
      step: "confirm",
    });
  };

  const handleConfirmSendCode = async () => {
    if (!forgotModal.profile) return;
    if (!isSignedIn) {
      setForgotModal((prev) => ({
        ...prev,
        error: "PIN email reset requires signing in to your account.",
      }));
      return;
    }

    setForgotModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await forgotRemoteProfilePin(forgotModal.profile.id);
      setForgotModal((prev) => ({
        ...prev,
        loading: false,
        email: res.email || user?.email || "",
        success: `Reset code sent to ${res.email || user?.email}.`,
        step: "reset",
      }));
    } catch (err) {
      setForgotModal((prev) => ({
        ...prev,
        loading: false,
        error: err.data?.error || err.message || "Failed to send reset code.",
      }));
    }
  };

  const handleResetPinSubmit = async (e) => {
    e.preventDefault();
    if (forgotModal.loading || !forgotModal.profile) return;

    setForgotModal((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      await resetRemoteProfilePin(forgotModal.profile.id, {
        resetCode: forgotModal.resetCode.trim(),
        newPin: forgotModal.newPin.trim() || null,
      });

      setForgotModal((prev) => ({
        ...prev,
        loading: false,
        success: "PIN successfully updated!",
      }));

      setTimeout(async () => {
        setForgotModal({
          isOpen: false,
          profile: null,
          email: "",
          resetCode: "",
          newPin: "",
          error: "",
          success: "",
          loading: false,
          step: "request",
        });
        await refreshProfiles();
      }, 1000);
    } catch (err) {
      setForgotModal((prev) => ({
        ...prev,
        loading: false,
        error: err.data?.error || err.message || "Failed to reset PIN.",
      }));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        {planQuota && (
          <div className={styles.planBadge}>
            {planQuota.label} Plan • {profiles.length} of {planQuota.maxProfiles} Profiles
          </div>
        )}
        <h1 className={styles.title}>
          {isManaging ? "Manage Profiles" : "Who\u2019s watching?"}
        </h1>
        <p className={styles.subtitle}>
          {isManaging
            ? "Select a profile to customize name, avatar, or 4-digit PIN lock."
            : "Select a profile to continue watching your customized recommendations."}
        </p>
      </div>

      <div className={styles.profilesList}>
        {profiles.map((profile) => {
          const isActive = String(profile.id) === String(activeProfileId);
          const isKids = Boolean(profile.isKids);
          const hasPin = Boolean(profile.hasPin || profile.pin);

          return (
            <button
              key={profile.id}
              type="button"
              className={styles.profileItem}
              onClick={() => handleProfileClick(profile)}
              title={isManaging ? `Edit ${profile.name}` : `Switch to ${profile.name}`}
            >
              <div
                className={`${styles.avatarWrap} ${
                  isActive && !isManaging ? styles.avatarWrapActive : ""
                }`}
              >
                <img
                  src={profile.avatar || PRESET_AVATARS[0].url}
                  alt={profile.name}
                  className={styles.avatarImg}
                  referrerPolicy="no-referrer"
                />

                {isKids && <span className={styles.kidsBadge}>Kids</span>}

                {hasPin && !isManaging && (
                  <span className={styles.lockBadge} title="PIN Protected">
                    <Lock size={12} strokeWidth={2.5} />
                  </span>
                )}

                {isManaging && (
                  <div className={styles.manageOverlay}>
                    <Pencil size={24} className={styles.managePencil} />
                  </div>
                )}

                {isActive && !isManaging && (
                  <div className={`${styles.activeBadge} ${styles.activeCheck}`}>
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </div>

              <span className={styles.profileName}>{profile.name}</span>
            </button>
          );
        })}
        {profiles.length < (planQuota?.maxProfiles || MAX_PROFILES) && (
          <button
            type="button"
            className={`${styles.profileItem} ${styles.addProfileItem}`}
            onClick={openAddProfileModal}
            title="Add a new profile"
          >
            <div className={styles.addAvatarWrap}>
              <Plus size={36} strokeWidth={1.75} className={styles.addIcon} />
            </div>
            <span className={styles.profileName}>Add Profile</span>
          </button>
        )}
      </div>

      <div className={styles.manageActions}>
        <button
          type="button"
          className={`${styles.manageBtn} ${isManaging ? styles.manageBtnActive : ""}`}
          onClick={() => setIsManaging(!isManaging)}
        >
          {isManaging ? "Done" : "Manage Profiles"}
        </button>
      </div>

      {modalMode && (
        <div className={styles.modalOverlay} onClick={() => setModalMode(null)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {modalMode === "add" ? "Add Profile" : "Edit Profile"}
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setModalMode(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className={styles.modalBody}>
                {formError && <div className={styles.pinError} style={{ marginBottom: 12 }}>{formError}</div>}

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="profileNameInput">
                    Profile Name
                  </label>
                  <input
                    id="profileNameInput"
                    type="text"
                    className={styles.textInput}
                    maxLength={20}
                    placeholder="e.g. Alex"
                    value={formProfile.name}
                    onChange={(e) =>
                      setFormProfile((prev) => ({ ...prev, name: e.target.value }))
                    }
                    autoFocus
                    required
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Choose Avatar</label>
                  <div className={styles.avatarGrid}>
                    {PRESET_AVATARS.map((av) => {
                      const isSelected = formProfile.avatar === av.url;
                      return (
                        <button
                          key={av.id}
                          type="button"
                          className={`${styles.avatarOption} ${
                            isSelected ? styles.avatarOptionSelected : ""
                          }`}
                          onClick={() =>
                            setFormProfile((prev) => ({ ...prev, avatar: av.url }))
                          }
                          title={av.label}
                        >
                          <img
                            src={av.url}
                            alt={av.label}
                            className={styles.avatarOptionImg}
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.toggleRow}>
                  <div className={styles.toggleText}>
                    <span className={styles.toggleTitle}>Kids Profile</span>
                    <span className={styles.toggleDesc}>
                      Only show titles and content suitable for children
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={formProfile.isKids}
                    onChange={(e) =>
                      setFormProfile((prev) => ({ ...prev, isKids: e.target.checked }))
                    }
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <div className={styles.toggleRow}>
                    <div className={styles.toggleText}>
                      <span className={styles.toggleTitle}>Profile Lock (PIN)</span>
                      <span className={styles.toggleDesc}>
                        Require a 4-digit PIN to access this profile
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={formProfile.pinEnabled}
                      onChange={(e) =>
                        setFormProfile((prev) => ({
                          ...prev,
                          pinEnabled: e.target.checked,
                          pin: e.target.checked ? prev.pin : "",
                        }))
                      }
                    />
                  </div>

                  {formProfile.hadExistingPin && (
                    <div className={styles.pinInputsWrap} style={{ marginTop: 12 }}>
                      <label className={styles.pinLabel}>
                        Current PIN {formProfile.pinEnabled ? "to change PIN" : "to remove PIN"}
                      </label>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <input
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          placeholder="••••"
                          title="Enter 4-digit current PIN"
                          className={styles.pinInput}
                          value={formProfile.oldPin}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setFormProfile((prev) => ({ ...prev, oldPin: val }));
                          }}
                          required
                        />
                        <button
                          type="button"
                          className={styles.forgotPinBtn}
                          onClick={() => handleStartForgotPin(formProfile)}
                        >
                          Forgot PIN?
                        </button>
                      </div>
                    </div>
                  )}

                  {formProfile.pinEnabled && (
                    <div className={styles.pinInputsWrap} style={{ marginTop: 12 }}>
                      <label className={styles.pinLabel}>
                        {formProfile.hadExistingPin ? "New 4-digit PIN" : "Set 4-digit PIN"}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        placeholder="••••"
                        className={styles.pinInput}
                        value={formProfile.pin}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                          setFormProfile((prev) => ({ ...prev, pin: val }));
                        }}
                        required={!formProfile.hadExistingPin}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.modalFooter}>
                {modalMode === "edit" && formProfile.id !== "1" && profiles.length > 1 ? (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={handleDeleteProfile}
                  >
                    <Trash2 size={16} />
                    Delete Profile
                  </button>
                ) : (
                  <div />
                )}
                <div className={styles.btnGroup}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setModalMode(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {unlockTarget && (
        <div className={styles.modalOverlay} onClick={() => setUnlockTarget(null)}>
          <div
            className={styles.unlockCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.unlockAvatarBox}>
              <img
                src={unlockTarget.avatar}
                alt={unlockTarget.name}
                className={styles.avatarImg}
                referrerPolicy="no-referrer"
              />
            </div>
            <h2 className={styles.unlockTitle}>Profile Lock</h2>
            <p className={styles.unlockDesc}>
              Enter your 4-digit PIN to access <strong>{unlockTarget.name}</strong>.
            </p>

            <form onSubmit={handleUnlockSubmit} style={{ width: "100%" }}>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="••••"
                className={styles.pinInput}
                style={{ width: "100%", maxWidth: "200px", margin: "0 auto 12px" }}
                value={unlockPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setUnlockPin(val);
                  setUnlockError("");
                }}
                autoFocus
                required
              />

              {unlockError && <div className={styles.pinError}>{unlockError}</div>}

              <div>
                <button
                  type="button"
                  className={styles.forgotPinBtn}
                  onClick={() => handleStartForgotPin(unlockTarget)}
                >
                  Forgot PIN?
                </button>
              </div>

              <div className={styles.btnGroup} style={{ marginTop: "24px", justifyContent: "center" }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setUnlockTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isUnlocking}>
                  {isUnlocking ? "Unlocking..." : "Unlock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {forgotModal.isOpen && (
        <div className={styles.modalOverlay} onClick={() => setForgotModal((p) => ({ ...p, isOpen: false }))}>
          <div
            className={styles.unlockCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.unlockAvatarBox}>
              <img
                src={forgotModal.profile?.avatar || PRESET_AVATARS[0].url}
                alt={forgotModal.profile?.name}
                className={styles.avatarImg}
                referrerPolicy="no-referrer"
              />
            </div>
            {forgotModal.step === "confirm" ? (
              <>
                <h2 className={styles.unlockTitle}>Reset PIN?</h2>
                <p className={styles.unlockDesc}>
                  Send a 6-digit PIN reset code to <strong>{user?.email || "your account email"}</strong> to reset the PIN for profile <strong>{forgotModal.profile?.name}</strong>?
                </p>

                {forgotModal.error && <div className={styles.pinError}>{forgotModal.error}</div>}

                <div className={styles.btnGroup} style={{ marginTop: "24px", justifyContent: "center" }}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setForgotModal((p) => ({ ...p, isOpen: false }))}
                    disabled={forgotModal.loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleConfirmSendCode}
                    disabled={forgotModal.loading}
                  >
                    {forgotModal.loading ? "Sending..." : "Send Reset Code"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className={styles.unlockTitle}>Reset Profile PIN</h2>
                <p className={styles.unlockDesc}>
                  We sent a 6-digit verification code to <strong>{forgotModal.email || user?.email}</strong>.
                </p>

                {forgotModal.error && <div className={styles.pinError}>{forgotModal.error}</div>}
                {forgotModal.success && <div className={styles.resetSuccess}>{forgotModal.success}</div>}

                <form onSubmit={handleResetPinSubmit} style={{ width: "100%", marginTop: "16px" }}>
                  <div style={{ marginBottom: "16px", textAlign: "left" }}>
                    <label className={styles.pinLabel}>6-Digit Email Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="123456"
                      className={styles.textInput}
                      style={{ textAlign: "center", fontSize: "1.2rem", letterSpacing: "4px" }}
                      value={forgotModal.resetCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setForgotModal((p) => ({ ...p, resetCode: val, error: "" }));
                      }}
                      autoFocus
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "20px", textAlign: "left" }}>
                    <label className={styles.pinLabel}>New 4-Digit PIN (or leave blank to remove lock)</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="••••"
                      className={styles.textInput}
                      style={{ textAlign: "center", fontSize: "1.2rem", letterSpacing: "4px" }}
                      value={forgotModal.newPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setForgotModal((p) => ({ ...p, newPin: val, error: "" }));
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      type="button"
                      className={styles.forgotPinBtn}
                      onClick={handleConfirmSendCode}
                      disabled={forgotModal.loading}
                    >
                      Resend Code
                    </button>
                  </div>

                  <div className={styles.btnGroup} style={{ marginTop: "24px", justifyContent: "center" }}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setForgotModal((p) => ({ ...p, isOpen: false }))}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={styles.btnPrimary}
                      disabled={forgotModal.loading || forgotModal.resetCode.length !== 6}
                    >
                      {forgotModal.loading ? "Updating..." : "Update PIN"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <h1 className={styles.title}>Who&apos;s watching?</h1>
        </div>
      }
    >
      <ProfilesContent />
    </Suspense>
  );
}
