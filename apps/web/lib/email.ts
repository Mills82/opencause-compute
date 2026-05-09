export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; provider: 'console' | 'resend' | 'disabled' }> {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.ENROLLMENT_EMAIL_FROM;

  if (!resendKey || !from) {
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
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text })
  });

  if (!response.ok) {
    throw new Error(`email_send_failed:${response.status}`);
  }
  return { sent: true, provider: 'resend' };
}
