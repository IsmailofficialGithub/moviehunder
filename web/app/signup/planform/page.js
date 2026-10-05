"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import { storeSession } from "../../../lib/auth";
import StepTwoPlanOverview from "../../../components/onboarding/StepTwoPlanOverview";
import StepThreePlanSelection from "../../../components/onboarding/StepThreePlanSelection";
import PaymentCheckoutModal from "../../../components/onboarding/PaymentCheckoutModal";

function PlanformContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isSignedIn, hasActivePlan, refresh, logout } = useAuth();

  const [step, setStep] = useState(2);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [sessionStored, setSessionStored] = useState(false);

  useEffect(() => {
    // Check if magic link tokens arrived in searchParams
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    if (accessToken && refreshToken) {
      storeSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      refresh().catch(() => {});
      setSessionStored(true);
    }
  }, [searchParams, refresh]);

  useEffect(() => {
    const initialStep = searchParams.get("step");
    if (initialStep === "3") {
      setStep(3);
    }
  }, [searchParams]);

  useEffect(() => {
    // If user already has an active plan, redirect to catalog on /
    if (hasActivePlan) {
      router.push("/");
    }
  }, [hasActivePlan, router]);

  const handleCheckoutSuccess = () => {
    setShowCheckout(false);
    router.push("/");
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0c0c0e", color: "#ffffff" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 36px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "8px",
            textDecoration: "none",
            color: "#ffffff",
          }}
        >
          <span style={{ fontSize: "1.75rem", fontWeight: "900", letterSpacing: "-0.5px" }}>
            OFF<span style={{ color: "#bd84db" }}>STREAM</span>
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#a1a1aa",
              fontWeight: "600",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            · Movies Hunder
          </span>
        </Link>

        {isSignedIn && (
          <button
            type="button"
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#d4d4d8",
              padding: "6px 16px",
              borderRadius: "4px",
              fontSize: "0.9rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        )}
      </header>

      {/* Main Multi-Step Onboarding */}
      <main style={{ padding: "20px 16px" }}>
        {step === 2 && (
          <StepTwoPlanOverview onNext={() => setStep(3)} />
        )}

        {step === 3 && (
          <StepThreePlanSelection
            onProceed={(plan) => {
              setSelectedPlan(plan);
              setShowCheckout(true);
            }}
          />
        )}
      </main>

      {/* Payment Modal */}
      {showCheckout && (
        <PaymentCheckoutModal
          plan={selectedPlan}
          onClose={() => setShowCheckout(false)}
          onChangePlan={() => setShowCheckout(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "36px 24px",
          maxWidth: "960px",
          margin: "0 auto",
          color: "#71717a",
          fontSize: "0.85rem",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} OffStream & Movies Hunder. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default function PlanformPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#0c0c0e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#bd84db",
          }}
        >
          Loading your plan setup...
        </div>
      }
    >
      <PlanformContent />
    </Suspense>
  );
}
