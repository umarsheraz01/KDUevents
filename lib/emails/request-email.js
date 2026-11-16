// =============================================================================
// lib/emails/request-email.js — THE EMAIL THE ADMIN GETS FOR A NEW REQUEST
// -----------------------------------------------------------------------------
// requestEmail(title, rows, replyTo) → { subject, text, html }
//   rows: [[label, value], ...] shown as a simple table.
// "Reply" in the email app goes straight to the person who sent the form.
// =============================================================================
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function requestEmail(title, rows, replyTo) {
  const filled = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  const text = `${title}\n\n` + filled.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nReply to this email to answer ${replyTo}.`;

  const tableRows = filled.map(([k, v]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;white-space:pre-wrap;">${esc(v)}</td>
        </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#0b192c;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:800;">KDU <span style="color:#ff3b30;">EVENTS</span></td></tr>
    <tr><td style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a;">${esc(title)}</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${tableRows}</table>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Press <strong>Reply</strong> to answer ${esc(replyTo)} directly.</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject: title, text, html };
}

module.exports = requestEmail;
