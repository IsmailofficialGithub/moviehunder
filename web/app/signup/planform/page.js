"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { storeSession } from "../../../lib/auth";
import StepTwoPlanOverview from "../../../components/onboarding/StepTwoPlanOverview";
import StepThreePlanSelection from "../../../components/onboarding/StepThreePlanSelection";
import PaymentCheckoutModal from "../../../components/onboarding/PaymentCheckoutModal";

function PlanformContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isSignedIn, hasActivePlan, refresh } = useAuth();

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
    <div style={{ minHeight: "85vh", backgroundColor: "#0c0c0e", color: "#ffffff" }}>
      {/* Main Multi-Step Onboarding */}
      <main style={{ padding: "40px 16px" }}>
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
