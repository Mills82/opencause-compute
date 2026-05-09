import { describe, expect, it, vi } from 'vitest';
import { sendEmail } from '../lib/email';

describe('email helper', () => {
  it('is disabled in production when provider env is missing', async () => {
    const oldEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    delete process.env.ENROLLMENT_EMAIL_FROM;
    try {
      await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toEqual({ sent: false, provider: 'disabled' });
    } finally {
      process.env = oldEnv;
    }
  });

  it('sends through resend when configured', async () => {
    const oldEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 'key';
    process.env.ENROLLMENT_EMAIL_FROM = 'OpenCause <hello@example.com>';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    try {
      await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toEqual({ sent: true, provider: 'resend' });
      expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST' }));
    } finally {
      fetchMock.mockRestore();
      process.env = oldEnv;
    }
  });
});
