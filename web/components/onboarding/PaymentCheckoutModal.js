"use client";

import { useState } from "react";
import { subscribeToPlan } from "../../lib/auth";
import { useAuth } from "../AuthProvider";
import styles from "./PaymentCheckoutModal.module.css";

export default function PaymentCheckoutModal({
  plan,
  onClose,
  onChangePlan,
  onSuccess,
}) {
  const { setHasActivePlan, setSubscription, refresh } = useAuth();
  const [cardNumber, setCardNumber] = useState("4242 •••• •••• 4242");
  const [expiry, setExpiry] = useState("12/28");
  const [cvv, setCvv] = useState("123");
  const [name, setName] = useState("OffStream Subscriber");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!plan?.id) return;
    setError("");
    setLoading(true);

    try {
      const res = await subscribeToPlan(plan.id, {
        type: "card",
        last4: "4242",
        brand: "Visa",
      });

      if (res?.ok) {
        setHasActivePlan(true);
        if (res.subscription) {
          setSubscription(res.subscription);
        }
        await refresh().catch(() => {});
        if (onSuccess) onSuccess();
      } else {
        throw new Error(res?.error || "Payment failed. Please try again.");
      }
    } catch (err) {
      setError(err.message || "Failed to process payment");
    } finally {
      setLoading(false);
    }
  };

  const formattedPrice = `PKR ${plan?.price ? plan.price.toLocaleString() : "800"}/month`;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className={styles.title}>Set up your payment</h2>
        <p className={styles.subtitle}>
          Your membership starts as soon as you set up payment.
        </p>

        <div className={styles.planSummary}>
          <div className={styles.planSummaryDetails}>
            <span className={styles.planSummaryName}>{plan?.name || "Standard"} Plan</span>
            <span className={styles.planSummaryPrice}>{formattedPrice}</span>
          </div>
          {onChangePlan && (
            <button
              type="button"
              className={styles.changePlanBtn}
              onClick={onChangePlan}
            >
              Change
            </button>
          )}
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Card Number</label>
            <input
              type="text"
              className={styles.input}
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="Card number"
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Expiration</label>
              <input
                type="text"
                className={styles.input}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                placeholder="MM / YY"
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Security Code</label>
              <input
                type="text"
                className={styles.input}
                value={cvv}
                onChange={(e) => setCvv(e.target.value)}
                placeholder="CVV"
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Name on Card</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name on card"
              required
            />
          </div>

          <p className={styles.notice}>
            🔒 Simulated test transaction. By clicking &quot;Start Membership&quot;, you agree that your membership begins immediately. You may cancel online at any time.
          </p>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? "Activating Membership..." : "Start Membership"}
          </button>
        </form>
      </div>
    </div>
  );
}
