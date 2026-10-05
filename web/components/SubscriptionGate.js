"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function SubscriptionGate({ children }) {
  const router = useRouter();
  const { isSignedIn, hasActivePlan, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!isSignedIn) {
        router.replace("/");
      } else if (!hasActivePlan) {
        router.replace("/signup/planform?step=2");
      }
    }
  }, [loading, isSignedIn, hasActivePlan, router]);

  // While auth hydration is pending
  if (loading) {
    return (
      <div
        style={{
          minHeight: "75vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0c0c0e",
          color: "#bd84db",
          fontSize: "1.05rem",
        }}
      >
        <span>Loading OffStream...</span>
      </div>
    );
  }

  // Not signed in or unsubscribed
  if (!isSignedIn || !hasActivePlan) {
    return (
      <div
        style={{
          minHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0c0c0e",
          color: "#ffffff",
          textAlign: "center",
          padding: "40px 20px",
        }}
      >
        <div style={{ fontSize: "2.6rem", marginBottom: "16px" }}>🔒</div>
        <h2 style={{ fontSize: "1.75rem", fontWeight: "800", marginBottom: "12px", color: "#ffffff" }}>
          Subscription Required
        </h2>
        <p style={{ color: "#a1a1aa", maxWidth: "440px", lineHeight: "1.5", marginBottom: "24px", fontSize: "0.98rem" }}>
          An active OffStream membership is required to access movies, TV series, anime, and songs. Plans start at Rs250/month.
        </p>
        <a
          href={isSignedIn ? "/signup/planform?step=2" : "/"}
          style={{
            padding: "13px 32px",
            background: "linear-gradient(135deg, #5a00a2 0%, #3d0081 100%)",
            color: "#ffffff",
            fontWeight: "700",
            borderRadius: "6px",
            textDecoration: "none",
            boxShadow: "0 4px 15px rgba(61, 0, 129, 0.4)",
          }}
        >
          {isSignedIn ? "Choose a Plan" : "Get Started"}
        </a>
      </div>
    );
  }

  return children;
}
