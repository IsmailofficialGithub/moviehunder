"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import LandingPage from "./landing/LandingPage";
import CatalogRows from "./CatalogRows";

export default function HomeGateway({ sections = [] }) {
  const router = useRouter();
  const { isSignedIn, hasActivePlan, loading } = useAuth();

  useEffect(() => {
    if (!loading && isSignedIn && !hasActivePlan) {
      router.push("/signup/planform?step=2");
    }
  }, [loading, isSignedIn, hasActivePlan, router]);

  // Signed in with an active plan -> show catalog
  if (!loading && isSignedIn && hasActivePlan) {
    return <CatalogRows sections={sections} />;
  }

  // Signed in but no active plan -> show prompt while router redirects
  if (!loading && isSignedIn && !hasActivePlan) {
    return (
      <div
        style={{
          minHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          backgroundColor: "#08080b",
          color: "#ffffff",
          padding: "40px 20px",
        }}
      >
        <h2 style={{ fontSize: "1.85rem", fontWeight: "800", marginBottom: "12px" }}>
          Select a Plan to Start Streaming
        </h2>
        <p style={{ color: "#a1a1aa", maxWidth: "460px", marginBottom: "24px", lineHeight: "1.6" }}>
          You’re signed in. Choose your membership tier to unlock all movies, series, and Hindi dubbed cinema.
        </p>
        <button
          type="button"
          onClick={() => router.push("/signup/planform?step=2")}
          style={{
            padding: "14px 32px",
            fontSize: "1.05rem",
            fontWeight: "700",
            border: "none",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #7c3aed 0%, #5a00a2 100%)",
            color: "#ffffff",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(124, 58, 237, 0.4)",
          }}
        >
          Choose Your Plan
        </button>
      </div>
    );
  }

  // Default: Guest or initial SSR / hydration -> Immediately render complete LandingPage!
  // No loading screen blocking SEO or user perception!
  return <LandingPage sections={sections} />;
}
