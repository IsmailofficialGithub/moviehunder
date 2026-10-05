"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Sparkles, X, Tv } from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import {
  fetchProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  buyExtraSlot,
  getActiveProfile,
  setActiveProfile,
  CURATED_AVATARS,
  generateAvatarUrl,
} from "../../lib/profiles";
import BtnSpinner from "../../components/BtnSpinner";
import styles from "./profiles.module.css";

function ProfilesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isSignedIn, hasActivePlan, loading: authLoading } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isManaging, setIsManaging] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState(null);

  // Modals state
  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [editingProfile, setEditingProfile] = useState(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isKids, setIsKids] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchProfiles();
      if (data?.ok) {
        setProfiles(data.profiles || []);
        setLimits(data.limits || null);
        const storedActive = getActiveProfile();
        if (storedActive && data.profiles?.some((p) => p.id === storedActive.id)) {
          setActiveProfileId(storedActive.id);
        } else if (data.profiles?.length > 0) {
          // If no active profile or obsolete, pick the primary
          const primary = data.profiles.find((p) => p.isPrimary) || data.profiles[0];
          setActiveProfile(primary);
          setActiveProfileId(primary.id);
        }
      }
    } catch (err) {
      setError(err?.message || "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isSignedIn) {
      router.replace("/login");
      return;
    }
    if (!hasActivePlan) {
      router.replace("/signup/planform?step=2");
      return;
    }
    loadData();
  }, [authLoading, isSignedIn, hasActivePlan, router, loadData]);

  useEffect(() => {
    if (searchParams.get("manage") === "true") {
      setIsManaging(true);
    }
    if (searchParams.get("add") === "true") {
      openAddModal();
    }
  }, [searchParams]);

  const selectProfile = (profile) => {
    if (isManaging) {
      openEditModal(profile);
      return;
    }
    setActiveProfile(profile);
    setActiveProfileId(profile.id);
    router.push("/");
  };

  const openAddModal = () => {
    setName("");
    const defaultAv = generateAvatarUrl("New", { isKids: false });
    setAvatarUrl(defaultAv);
    setIsKids(false);
    setError("");
    setModal("add");
  };

  const openEditModal = (profile) => {
    setEditingProfile(profile);
    setName(profile.name || "");
    setAvatarUrl(profile.avatarUrl || generateAvatarUrl(profile.name, { isKids: profile.isKids }));
    setIsKids(Boolean(profile.isKids));
    setError("");
    setModal("edit");
  };

  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setEditingProfile(null);
    setError("");
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Please enter a profile name");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (modal === "add") {
        const res = await createProfile({
          name: cleanName,
          avatarUrl,
          isKids,
        });
        if (res?.ok) {
          await loadData();
          closeModal();
        }
      } else if (modal === "edit" && editingProfile) {
        const res = await updateProfile(editingProfile.id, {
          name: cleanName,
          avatarUrl,
          isKids,
        });
        if (res?.ok) {
          // If editing active profile, update stored active
          const active = getActiveProfile();
          if (active?.id === editingProfile.id) {
            setActiveProfile(res.profile);
          }
          await loadData();
          closeModal();
        }
      }
    } catch (err) {
      setError(err?.data?.message || err?.message || "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!editingProfile) return;
    if (profiles.length <= 1) {
      setError("You must have at least one viewing profile.");
      return;
    }
    if (!confirm(`Are you sure you want to delete profile "${editingProfile.name}"? Watch history for this profile will be permanently removed.`)) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await deleteProfile(editingProfile.id);
      if (res?.ok) {
        const active = getActiveProfile();
        if (active?.id === editingProfile.id) {
          const remaining = profiles.filter((p) => p.id !== editingProfile.id);
          if (remaining.length > 0) setActiveProfile(remaining[0]);
        }
        await loadData();
        closeModal();
      }
    } catch (err) {
      setError(err?.data?.message || err?.message || "Failed to delete profile");
    } finally {
      setBusy(false);
    }
  };

  const handleBuyExtra = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await buyExtraSlot();
      if (res?.ok) {
        setLimits(res.limits);
      }
    } catch (err) {
      setError(err?.data?.message || err?.message || "Could not add extra profile slot");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || (loading && profiles.length === 0)) {
    return (
      <div className={styles.container}>
        <BtnSpinner />
      </div>
    );
  }

  const tierLabel = limits?.tier ? limits.tier.replace(/_/g, " ") : "Standard";

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>
        {isManaging ? "Manage Profiles" : "Who\u2019s watching?"}
      </h1>

      {limits ? (
        <div className={styles.planBanner}>
          <Tv size={16} />
          <span>
            {tierLabel} Plan &bull; {limits.screens} Screen{limits.screens > 1 ? "s" : ""} &bull;{" "}
            {limits.currentCount} of {limits.totalAllowedProfiles} profiles used
          </span>
        </div>
      ) : null}

      <div className={styles.profilesList}>
        {profiles.map((p) => {
          const isActive = p.id === activeProfileId && !isManaging;
          return (
            <button
              key={p.id}
              className={styles.profileItem}
              onClick={() => selectProfile(p)}
              type="button"
              aria-label={isManaging ? `Edit profile ${p.name}` : `Select profile ${p.name}`}
            >
              <div
                className={`${styles.avatarBox} ${isActive ? styles.activeRing : ""}`}
                style={{ backgroundImage: `url(${p.avatarUrl || generateAvatarUrl(p.name)})` }}
              >
                {p.isKids ? <span className={styles.kidsBadge}>KIDS</span> : null}
                {isManaging ? (
                  <div className={styles.editOverlay}>
                    <Pencil className={styles.pencilIcon} />
                  </div>
                ) : null}
              </div>
              <span className={styles.name}>{p.name}</span>
            </button>
          );
        })}

        {/* Add Profile Card */}
        {limits?.canAddMore && !isManaging ? (
          <button
            className={styles.profileItem}
            onClick={openAddModal}
            type="button"
            aria-label="Add new profile"
          >
            <div className={`${styles.avatarBox} ${styles.addAvatarBox}`}>
              <Plus className={styles.addIcon} />
            </div>
            <span className={styles.name}>Add Profile</span>
            <span className={styles.slotTag}>
              {limits.currentCount}/{limits.totalAllowedProfiles}
            </span>
          </button>
        ) : null}
      </div>

      <div className={styles.actionsBar}>
        <button
          className={`${styles.manageBtn} ${isManaging ? styles.doneBtn : ""}`}
          onClick={() => setIsManaging(!isManaging)}
          type="button"
        >
          {isManaging ? "Done" : "Manage Profiles"}
        </button>
      </div>

      {/* ── Modal for Add / Edit ────────────────────────────────────────── */}
      {modal ? (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {modal === "add" ? "Add Profile" : "Edit Profile"}
              </h2>
              <button
                className={styles.closeBtn}
                onClick={closeModal}
                disabled={busy}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {error ? <div className={styles.errorText}>{error}</div> : null}

            {modal === "add" && limits && !limits.canAddMore ? (
              <div className={styles.limitAlert}>
                <p>You have reached the maximum of {limits.totalAllowedProfiles} profiles on your plan.</p>
                {limits.canPurchaseExtra ? (
                  <button
                    type="button"
                    className={styles.buySlotBtn}
                    onClick={handleBuyExtra}
                    disabled={busy}
                  >
                    + Add Extra Profile Slot
                  </button>
                ) : (
                  <p>Maximum allowed slots for your plan tier reached.</p>
                )}
              </div>
            ) : null}

            <form onSubmit={handleSaveProfile}>
              <div className={styles.avatarSection}>
                <div
                  className={styles.previewAvatar}
                  style={{ backgroundImage: `url(${avatarUrl || generateAvatarUrl(name || "User", { isKids })})` }}
                />

                <div className={styles.avatarChoices}>
                  {CURATED_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      className={`${styles.avatarChoiceBtn} ${avatarUrl === av.url ? styles.avatarSelected : ""}`}
                      style={{ backgroundImage: `url(${av.url})` }}
                      onClick={() => setAvatarUrl(av.url)}
                      title={av.label}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.randomSeedBtn}
                  onClick={() => {
                    const randomSeed = Math.random().toString(36).substring(2, 7);
                    setAvatarUrl(generateAvatarUrl(randomSeed, { isKids }));
                  }}
                >
                  <Sparkles size={14} />
                  <span>Random Avatar</span>
                </button>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="profileNameInput">
                  Profile Name
                </label>
                <input
                  id="profileNameInput"
                  type="text"
                  className={styles.textInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex, Mom, Kids"
                  maxLength={30}
                  disabled={busy}
                  autoFocus
                />
              </div>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={isKids}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsKids(checked);
                    if (checked && (!avatarUrl || avatarUrl.includes("5a00a2"))) {
                      setAvatarUrl(generateAvatarUrl(name || "Kids", { isKids: true }));
                    }
                  }}
                  disabled={busy}
                />
                <div className={styles.checkboxText}>
                  <span className={styles.checkboxLabel}>Kids Profile</span>
                  <span className={styles.checkboxSub}>
                    Filters content automatically for family and younger viewers.
                  </span>
                </div>
              </label>

              <div className={styles.modalActions}>
                {modal === "edit" ? (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={handleDeleteProfile}
                    disabled={busy || profiles.length <= 1}
                    title={profiles.length <= 1 ? "Cannot delete the last remaining profile" : "Delete this profile"}
                  >
                    Delete Profile
                  </button>
                ) : null}

                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeModal}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={busy || !name.trim() || (modal === "add" && limits && !limits.canAddMore)}
                >
                  {busy ? <BtnSpinner /> : modal === "add" ? "Create Profile" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <Suspense fallback={<div className={styles.container}><BtnSpinner /></div>}>
      <ProfilesContent />
    </Suspense>
  );
}
