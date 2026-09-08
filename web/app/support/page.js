'use client';
import React, { useState } from 'react';
import styles from '../legal.module.css';

export default function Support() {
  const [status, setStatus] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Normally handle form submission here
    setStatus('Thanks! Your message has been sent to our support team.');
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Support</h1>
      <span className={styles.lastUpdated}>We're here to help!</span>

      <div className={styles.section}>
        <h2>Contact Support</h2>
        <p>
          If you are experiencing issues with the MovieHunter app, or have questions regarding your account, please reach out to us. 
        </p>
        <p>
          <strong>Email:</strong> support@moviehunter.example.com
        </p>
      </div>

      <div className={styles.section}>
        <h2>Send us a Message</h2>
        {status ? (
          <p style={{ color: 'var(--secondary)', fontWeight: 'bold' }}>{status}</p>
        ) : (
          <form className={styles.contactForm} onSubmit={handleSubmit}>
            <input 
              type="text" 
              placeholder="Your Name" 
              className={styles.input} 
              required 
            />
            <input 
              type="email" 
              placeholder="Your Email" 
              className={styles.input} 
              required 
            />
            <textarea 
              placeholder="How can we help you?" 
              className={styles.textarea} 
              required 
            />
            <button type="submit" className={styles.submitBtn}>
              Submit Request
            </button>
          </form>
        )}
      </div>

      <div className={styles.section}>
        <h2>Frequently Asked Questions</h2>
        <ul>
          <li><strong>How do I reset my password?</strong> You can reset your password from the login screen by tapping 'Forgot Password'.</li>
          <li><strong>Why does the app need microphone access?</strong> The microphone is used for voice search capabilities within the app. You can disable this in your device settings.</li>
          <li><strong>How do I report a bug?</strong> Please use the contact form above and provide as much detail as possible, including your device model.</li>
        </ul>
      </div>
    </div>
  );
}
