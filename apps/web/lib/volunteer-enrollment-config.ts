export type PublicVolunteerEnrollmentConfig = {
  enabled: boolean;
  turnstileSiteKey?: string;
};

export function publicVolunteerEnrollmentConfig(): PublicVolunteerEnrollmentConfig {
  const publicEnrollmentEnabled = process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
  const emailDeliveryConfigured = Boolean(process.env.RESEND_API_KEY && process.env.ENROLLMENT_EMAIL_FROM);
  const hostedOrProduction = process.env.NODE_ENV === 'production' || process.env.OPENCAUSE_HOSTED === 'true' || process.env.VERCEL === '1';

  return {
    enabled: publicEnrollmentEnabled && Boolean(turnstileSiteKey) && (!hostedOrProduction || emailDeliveryConfigured),
    ...(turnstileSiteKey ? { turnstileSiteKey } : {})
  };
}
