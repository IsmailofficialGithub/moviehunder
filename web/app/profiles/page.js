"use client";

import { useRouter } from "next/navigation";
import styles from "./profiles.module.css";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";

export default function ProfilesPage() {
  const router = useRouter();
  const { user, isSignedIn } = useAuth();
  const [profiles, setProfiles] = useState([]);
  
  useEffect(() => {
    // If user is not logged in, they shouldn't be here (unless testing)
    // For MVP, we'll mock some profiles if none exist, or fetch from real API if we had one.
    const userAvatar = user?.avatar_url || user?.avatarUrl || user?.picture;
    setProfiles([
      { id: "1", name: user?.display_name || "Justin", avatar: userAvatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914" },
      { id: "2", name: "Guest", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest&backgroundColor=1a1a1b" },
      { id: "3", name: "Kids", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kids&backgroundColor=38bdf8" },
    ]);
  }, [user]);

  const selectProfile = (profile) => {
    // In a real app, this would set a profileId in a cookie/localStorage
    localStorage.setItem("active_profile", JSON.stringify(profile));
    router.push("/");
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Who&apos;s watching?</h1>
      
      <div className={styles.profilesList}>
        {profiles.map(p => (
          <button key={p.id} className={styles.profileItem} onClick={() => selectProfile(p)}>
            <div className={styles.avatarBox}>
              {p.avatar ? (
                <img
                  src={p.avatar}
                  alt={p.name}
                  className={styles.avatarImg}
                  referrerPolicy="no-referrer"
                />
              ) : null}
            </div>
            <span className={styles.name}>{p.name}</span>
          </button>
        ))}
        
        <button className={styles.profileItem} onClick={() => alert("Add Profile Mock")}>
          <div className={styles.avatarBox}>
            <Plus className={styles.avatarIcon} />
          </div>
          <span className={styles.name}>Add Profile</span>
        </button>
      </div>

      <button className={styles.manageBtn} onClick={() => alert("Manage Profiles Mock")}>
        Manage Profiles
      </button>
    </div>
  );
}
