import React from 'react';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Terms of Service | MovieHunter',
  description: 'Terms of Service for the MovieHunter application.',
};

export default function TermsOfService() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Terms of Service</h1>
      <span className={styles.lastUpdated}>Last Updated: September 2026</span>

      <div className={styles.section}>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing and using MovieHunter, you accept and agree to be bound by the terms and provision of this agreement.
        </p>
      </div>

      <div className={styles.section}>
        <h2>2. Use License</h2>
        <p>
          Permission is granted to temporarily download one copy of MovieHunter per device for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
        </p>
        <ul>
          <li>Modify or copy the materials;</li>
          <li>Use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
          <li>Attempt to decompile or reverse engineer any software contained in MovieHunter;</li>
          <li>Remove any copyright or other proprietary notations from the materials; or</li>
          <li>Transfer the materials to another person or &quot;mirror&quot; the materials on any other server.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2>3. Disclaimer</h2>
        <p>
          The materials within MovieHunter are provided on an &apos;as is&apos; basis. MovieHunter makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
        </p>
      </div>

      <div className={styles.section}>
        <h2>4. Limitations</h2>
        <p>
          In no event shall MovieHunter or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on MovieHunter, even if MovieHunter or an authorized representative has been notified orally or in writing of the possibility of such damage.
        </p>
      </div>

      <div className={styles.section}>
        <h2>5. Revisions</h2>
        <p>
          The materials appearing on MovieHunter could include technical, typographical, or photographic errors. MovieHunter does not warrant that any of the materials are accurate, complete or current. MovieHunter may make changes to the materials contained at any time without notice.
        </p>
      </div>

      <div className={styles.section}>
        <h2>6. Contact</h2>
        <p>
          If you have any questions about these Terms, please contact us at support@moviehunter.example.com.
        </p>
      </div>
    </div>
  );
}
