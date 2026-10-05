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
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/28");
  const [cvv, setCvv] = useState("123");
  const [name, setName] = useState("OffStream Subscriber");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formatCardNumber = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  };

  const handleCardChange = (e) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryChange = (e) => {
    let val = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (val.length >= 3) {
      val = `${val.slice(0, 2)}/${val.slice(2)}`;
    }
    setExpiry(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!plan?.id) return;
    setError("");
    setLoading(true);

    try {
      const res = await subscribeToPlan(plan.id, {
        type: "card",
        last4: cardNumber.replace(/\D/g, "").slice(-4) || "4242",
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

  const priceVal = plan?.price ? plan.price.toLocaleString() : "800";
  const formattedPrice = `PKR ${priceVal}`;
  const planName = plan?.name || "Standard";
  const resolutionText = plan?.resolution || "1080p Full HD";
  const screensCount = plan?.screens || 2;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close checkout"
        >
          <span className={styles.closeIcon}>×</span>
        </button>

        <div className={styles.modalGrid}>
          {/* ── LEFT COLUMN: ORDER & MEMBERSHIP SUMMARY ── */}
          <div className={styles.orderSummaryCol}>
            <div className={styles.brandBadge}>
              <span className={styles.secureDot} />
              <span>OFFSTREAM SECURE CHECKOUT</span>
            </div>

            <h2 className={styles.title}>Complete Your Membership</h2>
            <p className={styles.subtitle}>
              Instant access to all movies and series. Cancel anytime in one click.
            </p>

            {/* Selected Plan Details Card */}
            <div className={styles.planCard}>
              <div className={styles.planCardHead}>
                <div>
                  <h3 className={styles.planTitle}>{planName} Plan</h3>
                  <span className={styles.planQualityBadge}>{resolutionText}</span>
                </div>
                <div className={styles.planPriceBig}>
                  <span className={styles.currency}>PKR</span>
                  <span className={styles.amount}>{priceVal}</span>
                  <span className={styles.period}>/mo</span>
                </div>
              </div>

              <div className={styles.planPerksList}>
                <div className={styles.planPerkItem}>
                  <span className={styles.checkPip} />
                  <span>Unlimited Ads-Free Cinema & Series</span>
                </div>
                <div className={styles.planPerkItem}>
                  <span className={styles.checkPip} />
                  <span>{screensCount} Simultaneous {screensCount === 1 ? "Screen" : "Screens"}</span>
                </div>
                <div className={styles.planPerkItem}>
                  <span className={styles.checkPip} />
                  <span>Hindi Dubbed & Multi-Language Audio</span>
                </div>
                <div className={styles.planPerkItem}>
                  <span className={styles.checkPip} />
                  <span>Cancel Anytime With Zero Penalties</span>
                </div>
              </div>

              {onChangePlan && (
                <button
                  type="button"
                  className={styles.changePlanBtn}
                  onClick={onChangePlan}
                >
                  Switch to Another Plan
                </button>
              )}
            </div>

            {/* Line Item Breakdown */}
            <div className={styles.costBreakdown}>
              <div className={styles.costRow}>
                <span>Monthly Subscription</span>
                <span>{formattedPrice}</span>
              </div>
              <div className={styles.costRow}>
                <span>Setup & Activation Fee</span>
                <span className={styles.freeHighlight}>FREE</span>
              </div>
              <div className={styles.costDivider} />
              <div className={styles.costRowTotal}>
                <span>Total Due Today</span>
                <span>{formattedPrice}</span>
              </div>
            </div>

            {/* Security Guarantee Box */}
            <div className={styles.securityBox}>
              <div className={styles.securityHeader}>
                <span className={styles.shieldSymbol} />
                <strong>256-Bit SSL Encrypted Payment</strong>
              </div>
              <p className={styles.securityText}>
                Your payment credentials are processed with bank-level encryption. Your membership begins immediately upon checkout.
              </p>
            </div>
          </div>

          {/* ── RIGHT COLUMN: CARD PREVIEW & PAYMENT FORM ── */}
          <div className={styles.paymentFormCol}>
            {/* Interactive Virtual Card Preview */}
            <div className={styles.virtualCardWrap}>
              <div className={styles.virtualCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardChip}>
                    <div className={styles.chipLine1} />
                    <div className={styles.chipLine2} />
                  </div>
                  <div className={styles.cardWaveIcon}>
                    <span className={styles.wave1} />
                    <span className={styles.wave2} />
                    <span className={styles.wave3} />
                  </div>
                  <div className={styles.cardBrandLogo}>VISA</div>
                </div>

                <div className={styles.cardDisplayNumber}>
                  {cardNumber || "•••• •••• •••• ••••"}
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.cardMetaBlock}>
                    <span className={styles.cardMetaLabel}>CARDHOLDER</span>
                    <span className={styles.cardMetaValue}>
                      {name || "OFFSTREAM SUBSCRIBER"}
                    </span>
                  </div>
                  <div className={styles.cardMetaBlockRight}>
                    <span className={styles.cardMetaLabel}>EXPIRES</span>
                    <span className={styles.cardMetaValue}>
                      {expiry || "MM/YY"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Supported Brands Bar */}
            <div className={styles.acceptedCardsBar}>
              <span className={styles.acceptedLabel}>ACCEPTED:</span>
              <span className={styles.cardPill}>VISA</span>
              <span className={styles.cardPill}>MASTERCARD</span>
              <span className={styles.cardPill}>UNIONPAY</span>
              <span className={styles.cardPill}>PAYPAK</span>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Card Number</label>
                <div className={styles.inputWithBadge}>
                  <input
                    type="text"
                    className={styles.input}
                    value={cardNumber}
                    onChange={handleCardChange}
                    placeholder="4242 4242 4242 4242"
                    maxLength={19}
                    required
                  />
                  <span className={styles.inputBadge}>CARD</span>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Expiration Date</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={expiry}
                    onChange={handleExpiryChange}
                    placeholder="MM / YY"
                    maxLength={5}
                    required
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Security Code (CVC)</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
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
                  placeholder="Full name as shown on card"
                  required
                />
              </div>

              <p className={styles.notice}>
                Simulated test transaction. By clicking &quot;Start Membership&quot;, you authorize OffStream to activate your {planName} membership. You can cancel online at any time.
              </p>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.btnLoading}>
                    <span className={styles.spinner} />
                    <span>Processing Payment...</span>
                  </span>
                ) : (
                  <span>Start Membership • {formattedPrice}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
