import React from 'react';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Privacy Policy | MovieHunter',
  description: 'Privacy Policy for the MovieHunter application.',
};

export default function PrivacyPolicy() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Privacy Policy</h1>
      <span className={styles.lastUpdated}>Last Updated: September 2026</span>

      <div className={styles.section}>
        <h2>1. Introduction</h2>
        <p>
          Welcome to MovieHunter. This Privacy Policy explains how we collect, use,
          disclose, and safeguard your information when you visit our website or use
          our mobile application. Please read this privacy policy carefully. If you
          do not agree with the terms of this privacy policy, please do not access
          the application.
        </p>
      </div>

      <div className={styles.section}>
        <h2>2. Information We Collect</h2>
        <p>We may collect information about you in a variety of ways. The information we may collect via the Application includes:</p>
        <ul>
          <li>
            <strong>Device Information:</strong> Information about your mobile device, such as its hardware model, operating system version, unique device identifiers, and mobile network information.
          </li>
          <li>
            <strong>Audio and Media:</strong> Our application may request access to your device's microphone and media to enable certain audio/video recording and playback features. We only access this with your explicit permission.
          </li>
          <li>
            <strong>Usage Data:</strong> We may collect data regarding your activity on the App, such as features you use and media you view.
          </li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2>3. How We Use Your Information</h2>
        <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you to:</p>
        <ul>
          <li>Provide, operate, and maintain our Application.</li>
          <li>Improve, personalize, and expand our Application.</li>
          <li>Understand and analyze how you use our Application.</li>
          <li>Develop new products, services, features, and functionality.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2>4. Permissions and App Functionality</h2>
        <p>MovieHunter requests specific permissions on your device to function correctly:</p>
        <ul>
          <li><strong>Foreground Service:</strong> Used to allow media playback or downloads to continue when the app is in the background.</li>
          <li><strong>Microphone (Record Audio):</strong> Used for specific voice search or recording features within the app.</li>
          <li><strong>Notifications:</strong> Used to alert you about new releases or updates.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2>5. Contact Us</h2>
        <p>
          If you have questions or comments about this Privacy Policy, please contact us at:
        </p>
        <p>
          <strong>Email:</strong> support@moviehunter.example.com
        </p>
      </div>
    </div>
  );
}
