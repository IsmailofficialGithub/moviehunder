"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import LandingPage from "./landing/LandingPage";
import CatalogRows from "./CatalogRows";
import BannerAd468x60 from "./ads/BannerAd468x60";
import NativeBannerAd from "./ads/NativeBannerAd";

export default function HomeGateway({ sections = [] }) {
  const router = useRouter();
  const { isSignedIn, hasActivePlan, loading } = useAuth();

  useEffect(() => {
    if (!loading && isSignedIn && !hasActivePlan) {
      router.push("/signup/planform?step=2");
    }
  }, [loading, isSignedIn, hasActivePlan, router]);

  // While checking auth state
  if (loading) {
    return (
      <div
        style={{
          minHeight: "80vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0c0c0e",
          color: "#bd84db",
          fontSize: "1.1rem",
        }}
      >
        <span>Loading OffStream...</span>
      </div>
    );
  }

  // Guest landing page
  if (!isSignedIn) {
    return <LandingPage sections={sections} />;
  }

  // Signed in but no active subscription
  if (!hasActivePlan) {
    return (
      <div
        style={{
          minHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          backgroundColor: "#0c0c0e",
          color: "#ffffff",
          padding: "40px 20px",
        }}
      >
        <h2 style={{ fontSize: "2rem", fontWeight: "800", marginBottom: "12px" }}>
          Finish setting up your plan
        </h2>
        <p style={{ color: "#a1a1aa", maxWidth: "480px", marginBottom: "24px", lineHeight: "1.5" }}>
          You’re signed in! Choose a plan to unlock the entire OffStream & Movies Hunder movie and series catalog.
        </p>
        <button
          type="button"
          onClick={() => router.push("/signup/planform?step=2")}
          style={{
            padding: "14px 32px",
            fontSize: "1.1rem",
            fontWeight: "700",
            border: "none",
            borderRadius: "6px",
            background: "linear-gradient(135deg, #5a00a2 0%, #3d0081 100%)",
            color: "#ffffff",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(61, 0, 129, 0.4)",
          }}
        >
          Choose Your Plan
        </button>
      </div>
    );
  }

  // Subscribed member: Full unlocked catalog
  return (
    <>
      <BannerAd468x60 />
      <CatalogRows sections={sections} showHero />
      <NativeBannerAd />
    </>
  );
}
