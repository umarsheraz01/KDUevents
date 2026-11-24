// =============================================================================
// lib/emails/reset-email.js — THE "RESET YOUR PASSWORD" EMAIL (HTML DESIGN)
// -----------------------------------------------------------------------------
// Sent by routes/auth.js when a student uses "Forgot password?" on login.html.
// resetEmail(name, link) -> { subject, text, html }
// Email apps only support simple HTML, so the design uses tables and inline styles.
// =============================================================================
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = function resetEmail(name, link, minutes) {
  const hello = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  return {
    subject: 'Reset your KDU Events password',
    text: `${hello}\n\nSomeone (hopefully you) asked to reset the password of your KDU Events student account.\n\nOpen this link to choose a new password (it works once, for ${minutes} minutes):\n${link}\n\nIf you didn't ask for this, ignore this email - your password stays the same.\n\nKDU Events`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset your password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b192c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b192c; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #1e293b; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden;">
                <tr>
                  <td style="padding: 36px 32px 20px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff;">KDU <span style="color: #ff3b30;">EVENTS</span></h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff;">Reset your password</h2>
                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">${esc(hello)}</p>
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                      Someone (hopefully you) asked to reset the password of your KDU Events student account.
                      Press the button below to choose a new one. The link works once, for ${minutes} minutes.
                    </p>
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 24px 0;">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #ff3b30;">
                          <a href="${esc(link)}" target="_blank" style="font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; border: 1px solid #ff3b30; display: inline-block;">
                            Choose a new password &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">Button not working? Copy this link into your browser:</p>
                    <p style="margin: 0 0 24px 0; font-size: 12px; line-height: 1.5; color: #94a3b8; word-break: break-all;">${esc(link)}</p>
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                      Didn't ask for this? Just ignore this email - your password stays the same.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 32px; background-color: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #475569;">&copy; 2026 KDU Events. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };
};
