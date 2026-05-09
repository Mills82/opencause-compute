import { describe, expect, it, vi } from 'vitest';
import { enrollmentEmail, sendEmail } from '../lib/email';

describe('email helper', () => {
  it('renders polished enrollment text and html without omitting safety language', () => {
    const rendered = enrollmentEmail('occ_test_code');
    expect(rendered.subject).toContain('OpenCause Compute');
    expect(rendered.text).toContain('occ_test_code');
    expect(rendered.text).toContain('not medical advice');
    expect(rendered.html).toContain('occ_test_code');
    expect(rendered.html).toContain('OpenCause Compute is not medical advice');
  });

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

  it('sends html and text through resend when configured', async () => {
    const oldEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 'key';
    process.env.ENROLLMENT_EMAIL_FROM = 'OpenCause <hello@example.com>';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    try {
      await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' })).resolves.toEqual({ sent: true, provider: 'resend' });
      expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('html')
      }));
    } finally {
      fetchMock.mockRestore();
      process.env = oldEnv;
    }
  });
});
