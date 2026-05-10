export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function enrollmentEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ENROLLMENT_EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; provider: 'console' | 'resend' | 'disabled' }> {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.ENROLLMENT_EMAIL_FROM;

  if (!enrollmentEmailConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email:console]', JSON.stringify(message));
      return { sent: true, provider: 'console' };
    }
    return { sent: false, provider: 'disabled' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) })
  });

  if (!response.ok) {
    throw new Error(`email_send_failed:${response.status}`);
  }
  return { sent: true, provider: 'resend' };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
}

export function enrollmentEmail(code: string): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const safeCode = escapeHtml(code);
  return {
    subject: 'Your OpenCause Compute worker enrollment code',
    text: `Your OpenCause Compute worker enrollment code is:\n\n${code}\n\nUse this one-time code only on a computer you control. The worker contributes spare compute to AI-assisted open science by processing open-access research literature. OpenCause Compute is not medical advice.\n\nNext steps:\n1. Download or open the OpenCause Compute Worker.\n2. Enter this enrollment code when prompted.\n3. Keep activity logs visible and pause the worker whenever you need the machine back.\n\nIf you did not request this code, you can ignore this email.`,
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8fb;color:#172033;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e3e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px;">
                <p style="margin:0 0 8px;color:#4f46e5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">OpenCause Compute</p>
                <h1 style="margin:0;color:#111827;font-size:26px;line-height:1.25;">Your worker enrollment code</h1>
                <p style="margin:16px 0 0;color:#4b5563;font-size:15px;line-height:1.6;">
                  Use this one-time code to register an OpenCause Compute worker on a computer you control.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;">
                <div style="background:#111827;color:#ffffff;border-radius:12px;padding:18px 20px;font-family:SFMono-Regular,Consolas,monospace;font-size:20px;line-height:1.4;word-break:break-all;">
                  ${safeCode}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 28px 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                <h2 style="margin:14px 0 8px;color:#111827;font-size:17px;">Next steps</h2>
                <ol style="margin:0 0 16px 20px;padding:0;">
                  <li>Download or open the OpenCause Compute Worker.</li>
                  <li>Enter this enrollment code when prompted.</li>
                  <li>Keep activity logs visible and pause the worker whenever you need the machine back.</li>
                </ol>
                <p style="margin:0 0 12px;">
                  The worker contributes spare compute to AI-assisted open science by processing open-access research literature into citation-backed evidence candidates.
                </p>
                <p style="margin:0;color:#6b7280;font-size:13px;">
                  OpenCause Compute is not medical advice. Evidence candidates require consensus and/or human review before scientific use. If you did not request this code, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}
