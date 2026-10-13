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
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    auth: {
      user: String(process.env.SMTP_USER || "").trim(),
      pass: String(process.env.SMTP_PASS || "").trim().replace(/\s+/g, ""),
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

const LOGO_URL = "https://offstream.co/_next/image?url=%2Fbrand%2Flogo-symbol.png&w=128&q=75";

function emailLayout({ title, preheader = "", bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0c0c0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#ededed;">
  <!-- Preview text -->
  <div style="display:none;font-size:1px;color:#0c0c0e;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0c0c0e;min-height:100vh;padding:40px 16px;">
    <tr>
      <td align="center" valign="top">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;">
          <!-- Header / Brand -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" valign="middle">
                    <img src="${LOGO_URL}" width="48" height="48" alt="MovieHunter" style="display:block;border:0;border-radius:12px;outline:none;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#14141b;border:1px solid #262633;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,0.45);overflow:hidden;">
                <tr>
                  <td style="padding:36px 32px;">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;color:#71717a;font-size:12px;line-height:1.6;">
              <p style="margin:0 0 6px;color:#a1a1aa;font-weight:600;">MovieHunter &middot; OffStream</p>
              <p style="margin:0;color:#52525b;">If you did not make this request, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendMail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    console.warn("[mail] SMTP not configured (check SMTP_HOST & SMTP_USER in .env / .dev.vars) — skipping send to", to);
    return { skipped: true };
  }
  const info = await getTransporter().sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
  console.log("[mail] Email sent successfully to", to, "messageId:", info.messageId);
  return { messageId: info.messageId };
}

export async function sendVerificationEmail({ to, verifyUrl }) {
  const subject = "Verify your MovieHunter email";
  const text = `Verify your MovieHunter account:\n\n${verifyUrl}\n\nIf you did not sign up, ignore this email.`;
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;text-align:center;">Verify Your Email</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;text-align:center;">
      Welcome to MovieHunter! Confirm your email address to complete your account setup and unlock full streaming access.
    </p>
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:10px;background:#7c3aed;background-image:linear-gradient(135deg,#7c3aed 0%,#5a00a2 100%);">
          <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
            Verify Email Address
          </a>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #262633;padding-top:20px;margin-top:10px;">
      <p style="margin:0 0 6px;font-size:12px;color:#71717a;">Button not working? Paste this link into your browser:</p>
      <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${verifyUrl}" style="color:#bd84db;text-decoration:underline;">${verifyUrl}</a></p>
    </div>
  `;
  const html = emailLayout({
    title: subject,
    preheader: "Confirm your email address to finish signing up for MovieHunter.",
    bodyHtml,
  });
  return sendMail({ to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const subject = "Reset your MovieHunter password";
  const text = `Reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;text-align:center;">Reset Your Password</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;text-align:center;">
      We received a request to reset your password. Click the button below to choose a new password for your account.
    </p>
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:10px;background:#7c3aed;background-image:linear-gradient(135deg,#7c3aed 0%,#5a00a2 100%);">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #262633;padding-top:20px;margin-top:10px;">
      <p style="margin:0 0 6px;font-size:12px;color:#71717a;">Button not working? Paste this link into your browser:</p>
      <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${resetUrl}" style="color:#bd84db;text-decoration:underline;">${resetUrl}</a></p>
    </div>
  `;
  const html = emailLayout({
    title: subject,
    preheader: "Reset instructions for your MovieHunter password.",
    bodyHtml,
  });
  return sendMail({ to, subject, text, html });
}

export async function sendPinResetEmail({ to, profileName, code }) {
  const subject = `MovieHunter — PIN Reset Code for "${profileName}"`;
  const text = `You requested a PIN reset for profile "${profileName}".\n\nYour 6-digit reset code is: ${code}\n\nThis code expires in 15 minutes. If you did not request this reset, you can safely ignore this email.`;
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;text-align:center;">Profile PIN Reset</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;text-align:center;">
      You requested a PIN reset for profile <strong style="color:#ffffff;">${profileName}</strong>. Enter this 6-digit code to reset your PIN:
    </p>
    <div style="background-color:#1c1728;border:1px solid rgba(189,132,219,0.35);border-radius:12px;padding:22px 16px;text-align:center;margin:0 auto 24px;">
      <span style="font-family:'SF Mono',Consolas,Monaco,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#ffffff;display:inline-block;padding-left:10px;">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;text-align:center;">
      This verification code expires in <strong style="color:#a1a1aa;">15 minutes</strong>.
    </p>
  `;
  const html = emailLayout({
    title: subject,
    preheader: `Your PIN reset code for profile "${profileName}" is ${code}.`,
    bodyHtml,
  });
  return sendMail({ to, subject, text, html });
}

export { smtpConfigured, emailLayout, LOGO_URL };

