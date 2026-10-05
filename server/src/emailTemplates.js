/**
 * Email templates for OffStream & Movies Hunder onboarding and transactions.
 */

export function generateAccountCreationEmailHtml({
  creationUrl,
  startingPriceText = "Rs250/month",
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Let's create your account</title>
</head>
<body style="margin:0;padding:0;background-color:#0c0c0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e7;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0c0c0e;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;background:#141418;border-radius:12px;overflow:hidden;border:1px solid #282832;">
          <!-- Brand Header -->
          <tr>
            <td style="padding:28px 36px 16px 36px;border-bottom:1px solid #23232c;">
              <span style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;text-transform:uppercase;">
                OFF<span style="color:#bd84db;">STREAM</span>
              </span>
              <span style="font-size:12px;color:#8e8e99;margin-left:8px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
                · Movies Hunder
              </span>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:36px 36px 20px 36px;">
              <h1 style="margin:0 0 16px 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;">
                Let's create your account
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#d1d1d6;">
                Hey there,
              </p>
              <p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#d1d1d6;">
                We’re excited to have you! Tap the link below to create your account and start watching today’s hottest shows and movies. Plans start at <strong style="color:#ffffff;">${startingPriceText}.</strong>
              </p>

              <!-- CTA Button -->
              <table border="0" cellspacing="0" cellpadding="0" style="margin:0 0 28px 0;">
                <tr>
                  <td align="center" style="border-radius:8px;background:linear-gradient(135deg,#5a00a2 0%,#3d0081 100%);">
                    <a href="${creationUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 32px 0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                ⏰ <em>This link will expire in 15 minutes.</em>
              </p>

              <!-- Key Benefits List -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top:1px solid #23232c;padding-top:24px;margin-bottom:24px;">
                <tr>
                  <td style="padding-bottom:18px;">
                    <div style="font-size:15px;font-weight:700;color:#ffffff;margin-bottom:3px;">
                      ✓ No password needed
                    </div>
                    <div style="font-size:13px;color:#9d9da6;line-height:1.4;">
                      Use this email address to securely sign in anywhere.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:18px;">
                    <div style="font-size:15px;font-weight:700;color:#ffffff;margin-bottom:3px;">
                      ✓ Cancel anytime
                    </div>
                    <div style="font-size:13px;color:#9d9da6;line-height:1.4;">
                      Change or cancel your plan at any time.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:10px;">
                    <div style="font-size:15px;font-weight:700;color:#ffffff;margin-bottom:3px;">
                      ✓ Unlimited entertainment
                    </div>
                    <div style="font-size:13px;color:#9d9da6;line-height:1.4;">
                      Watch all you want, on all your devices, for one low price.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:12px;color:#71717a;line-height:1.5;">
                Didn't ask to create an OffStream account? <a href="https://offstream.co/support" style="color:#bd84db;text-decoration:none;">Let us know.</a>
              </p>
              <p style="margin:0;font-size:14px;color:#d1d1d6;font-weight:600;">
                The OffStream team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px 28px 36px;background:#0e0e12;border-top:1px solid #23232c;font-size:12px;color:#63636e;line-height:1.6;">
              Questions? Visit the <a href="https://offstream.co/help" style="color:#8e8e99;text-decoration:underline;">Help Center</a><br>
              OffStream Pte. Ltd. · Movies Hunder
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
