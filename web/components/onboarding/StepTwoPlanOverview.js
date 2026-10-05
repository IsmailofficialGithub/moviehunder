"use client";

import styles from "./StepTwoPlanOverview.module.css";

export default function StepTwoPlanOverview({ onNext }) {
  return (
    <div className={styles.container}>
      <div className={styles.iconCircle}>
        <span>✓</span>
      </div>
      <div className={styles.stepIndicator}>STEP 2 OF 3</div>
      <h1 className={styles.title}>Choose your plan</h1>

      <div className={styles.checkList}>
        <div className={styles.checkItem}>
          <span className={styles.checkIcon}>✓</span>
          <span>No commitments, cancel anytime.</span>
        </div>
        <div className={styles.checkItem}>
          <span className={styles.checkIcon}>✓</span>
          <span>Everything on OffStream for one low price.</span>
        </div>
        <div className={styles.checkItem}>
          <span className={styles.checkIcon}>✓</span>
          <span>No ads and no extra fees. Ever.</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.nextButton}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  );
}
