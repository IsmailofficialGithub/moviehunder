import nodemailer from "nodemailer";

let transporter = null;

function smtpConfigured() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  return Boolean(host && user);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigured()) {
    throw new Error("SMTP not configured (SMTP_HOST / SMTP_USER)");
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465;
  transporter = nodemailer.createTransport({
    host: String(process.env.SMTP_HOST).trim(),
    port,
    secure,
    auth: {
      user: String(process.env.SMTP_USER || "").trim(),
      pass: String(process.env.SMTP_PASS || ""),
    },
  });
  return transporter;
}

function fromAddress() {
  return (
    String(process.env.EMAIL_FROM || "").trim() ||
    String(process.env.SMTP_USER || "").trim() ||
    "noreply@moviehunter.local"
  );
}

export async function sendMail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    console.warn("[mail] SMTP not configured — skipping send to", to);
    return { skipped: true };
  }
  const info = await getTransporter().sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
  return { messageId: info.messageId };
}

export async function sendVerificationEmail({ to, verifyUrl }) {
  const subject = "Verify your MovieHunter email";
  const text = `Verify your MovieHunter account:\n\n${verifyUrl}\n\nIf you did not sign up, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2>Verify your email</h2>
      <p>Welcome to MovieHunter. Confirm your email to finish signing up.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#3d0081;color:#fff;text-decoration:none;border-radius:6px">Verify email</a></p>
      <p style="color:#666;font-size:13px">Or open: ${verifyUrl}</p>
    </div>
  `;
  return sendMail({ to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const subject = "Reset your MovieHunter password";
  const text = `Reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2>Reset password</h2>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#3d0081;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p>
      <p style="color:#666;font-size:13px">Or open: ${resetUrl}</p>
    </div>
  `;
  return sendMail({ to, subject, text, html });
}

export { smtpConfigured };
