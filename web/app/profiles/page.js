"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useCallback } from "react";
import { Plus, Check, Pencil, Lock, Trash2, X } from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import {
  PRESET_AVATARS,
  MAX_PROFILES,
  loadUserProfiles,
  saveUserProfiles,
  getActiveProfileId,
  switchActiveProfile,
} from "../../lib/profiles";
import styles from "./profiles.module.css";

function ProfilesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isSignedIn } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState("1");
  const [isManaging, setIsManaging] = useState(false);

  // Add / Edit Modal state
  const [modalMode, setModalMode] = useState(null); // null | "add" | "edit"
  const [formProfile, setFormProfile] = useState({
    id: null,
    name: "",
    avatar: PRESET_AVATARS[0].url,
    isKids: false,
    pin: "",
    pinEnabled: false,
  });

  // PIN Unlock Modal state
  const [unlockTarget, setUnlockTarget] = useState(null); // profile object or null
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState("");

  const refreshProfiles = useCallback(() => {
    const list = loadUserProfiles(user);
    setProfiles(list);
    const activeId = getActiveProfileId();
    setActiveProfileId(activeId);
    return { list, activeId };
  }, [user]);

  useEffect(() => {
    const { list } = refreshProfiles();

    // Check if redirected with ?unlock=<id>
    const unlockId = searchParams?.get("unlock");
    if (unlockId) {
      const target = list.find((p) => String(p.id) === String(unlockId));
      if (target) {
        if (target.pin) {
          setUnlockTarget(target);
          setUnlockPin("");
          setUnlockError("");
        } else {
          selectProfile(target);
        }
      }
    }

    const onProfileChange = (e) => {
      if (e?.detail?.id) {
        setActiveProfileId(String(e.detail.id));
      }
    };
    window.addEventListener("mh:profile:change", onProfileChange);
    window.addEventListener("mh:profiles_list:change", refreshProfiles);
    return () => {
      window.removeEventListener("mh:profile:change", onProfileChange);
      window.removeEventListener("mh:profiles_list:change", refreshProfiles);
    };
  }, [refreshProfiles, searchParams]);

  const selectProfile = (profile) => {
    setActiveProfileId(profile.id);
    switchActiveProfile(profile);
    router.push("/");
  };

  const handleProfileClick = (profile) => {
    if (isManaging) {
      // Open edit modal
      setFormProfile({
        id: profile.id,
        name: profile.name || "",
        avatar: profile.avatar || PRESET_AVATARS[0].url,
        isKids: !!profile.isKids,
        pin: profile.pin || "",
        pinEnabled: !!(profile.pin && profile.pin.trim().length > 0),
      });
      setModalMode("edit");
      return;
    }

    // Normal watch selection: check for PIN protection
    if (profile.pin && profile.pin.trim().length > 0) {
      setUnlockTarget(profile);
      setUnlockPin("");
      setUnlockError("");
      return;
    }

    selectProfile(profile);
  };

  const handleUnlockSubmit = (e) => {
    e.preventDefault();
    if (!unlockTarget) return;

    if (unlockPin.trim() === unlockTarget.pin.trim()) {
      const target = unlockTarget;
      setUnlockTarget(null);
      setUnlockPin("");
      setUnlockError("");
      selectProfile(target);
    } else {
      setUnlockError("Incorrect PIN. Please try again.");
    }
  };

  const openAddProfileModal = () => {
    if (profiles.length >= MAX_PROFILES) {
      alert(`Standard Plan limit reached (maximum ${MAX_PROFILES} profiles).`);
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
    });
    setModalMode("add");
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    const cleanName = formProfile.name.trim() || `Profile ${profiles.length + 1}`;
    const cleanPin = formProfile.pinEnabled ? formProfile.pin.trim().slice(0, 4) : "";

    if (modalMode === "add") {
      const newId = String(Date.now());
      const newProfile = {
        id: newId,
        name: cleanName,
        avatar: formProfile.avatar,
        isKids: formProfile.isKids,
        pin: cleanPin,
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
          };
        }
        return p;
      });
      saveUserProfiles(user, nextList);
      setProfiles(nextList);

      // If editing current active profile, update active profile cache
      if (String(formProfile.id) === String(activeProfileId)) {
        const updatedSelf = nextList.find((p) => p.id === formProfile.id);
        if (updatedSelf) {
          switchActiveProfile(updatedSelf);
        }
      }
    }

    setModalMode(null);
  };

  const handleDeleteProfile = () => {
    if (!formProfile.id || profiles.length <= 1) return;
    if (formProfile.id === "1") {
      alert("Primary profile cannot be removed.");
      return;
    }
    if (!confirm(`Are you sure you want to delete profile "${formProfile.name}"?`)) return;

    const nextList = profiles.filter((p) => p.id !== formProfile.id);
    saveUserProfiles(user, nextList);
    setProfiles(nextList);

    if (String(formProfile.id) === String(activeProfileId)) {
      const fallback = nextList[0];
      if (fallback) {
        selectProfile(fallback);
      }
    }

    setModalMode(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <div className={styles.planBadge}>
          Standard Plan • {profiles.length}/{MAX_PROFILES} Profiles
        </div>
        <h1 className={styles.title}>
          {isManaging ? "Manage Profiles" : "Who\u2019s watching?"}
        </h1>
        <p className={styles.subtitle}>
          {isManaging
            ? "Select a profile to customize its name, avatar, kids filter, or 4-digit PIN lock."
            : "Each profile keeps its own personalized watch history, bookmarks, and playback timestamps."}
        </p>
      </div>

      <div className={styles.profilesList}>
        {profiles.map((p) => {
          const isActive = String(p.id) === String(activeProfileId);
          return (
            <button
              key={p.id}
              type="button"
              className={`${styles.profileItem} ${isActive ? styles.profileItemActive : ""}`}
              onClick={() => handleProfileClick(p)}
              aria-current={isActive ? "true" : undefined}
            >
              <div className={`${styles.avatarBox} ${isActive ? styles.avatarBoxActive : ""}`}>
                {p.avatar ? (
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className={styles.avatarImg}
                    referrerPolicy="no-referrer"
                  />
                ) : null}

                {/* Edit Pencil Overlay during Manage Mode */}
                {isManaging && (
                  <div className={styles.editOverlay} title="Edit profile">
                    <Pencil size={24} strokeWidth={2.5} />
                    <span>Edit</span>
                  </div>
                )}

                {/* Lock Badge if profile has PIN */}
                {p.pin && !isManaging && (
                  <div className={styles.lockBadge} title="Profile is locked with a PIN">
                    <Lock size={12} strokeWidth={2.5} />
                  </div>
                )}

                {/* Active Indicator Badge */}
                {isActive && !isManaging && (
                  <div className={styles.activeBadge} title="Currently active profile">
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </div>

              <div className={styles.nameWrap}>
                <span className={styles.name}>{p.name}</span>
                {p.isKids && <span className={styles.kidsBadge}>KIDS</span>}
                {isActive && !p.isKids && <span className={styles.activeLabel}>Active</span>}
              </div>
            </button>
          );
        })}

        {/* Add Profile Card */}
        {profiles.length < MAX_PROFILES && (
          <button
            type="button"
            className={styles.profileItem}
            onClick={openAddProfileModal}
            title="Create a new profile"
          >
            <div className={styles.avatarBox}>
              <Plus className={styles.avatarIcon} />
            </div>
            <span className={styles.name}>Add Profile</span>
          </button>
        )}
      </div>

      <div className={styles.actionsBar}>
        <button
          type="button"
          className={`${styles.manageBtn} ${isManaging ? styles.manageBtnActive : ""}`}
          onClick={() => setIsManaging((prev) => !prev)}
        >
          {isManaging ? "Done" : "Manage Profiles"}
        </button>
      </div>

      {/* ── Add / Edit Profile Modal ── */}
      {modalMode && (
        <div className={styles.modalOverlay} onClick={() => setModalMode(null)}>
          <div
            className={styles.modalCard}
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
                {/* Profile Name */}
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

                {/* Avatar Picker */}
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

                {/* Kids Mode Toggle */}
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

                {/* Profile PIN Lock Toggle */}
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

                  {formProfile.pinEnabled && (
                    <div className={styles.pinInputsWrap}>
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
                        required={formProfile.pinEnabled}
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
                  <button type="submit" className={styles.btnPrimary}>
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PIN Unlock Modal ── */}
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

              <div className={styles.btnGroup} style={{ marginTop: "24px", justifyContent: "center" }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setUnlockTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Unlock
                </button>
              </div>
            </form>
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
