const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://opencause.appassist.ai';

export function GET() {
  const body = `# OpenCause Compute

OpenCause Compute is a volunteer-compute network for AI-assisted open science, operated by AppAssist.

It helps process open-access biomedical literature into structured, citation-backed candidate research evidence for validation, consensus, and review.

Important limitations:
- OpenCause Compute does not provide medical advice.
- Candidate outputs are not accepted scientific conclusions.
- Results require validation, consensus, and/or human review before scientific use.
- Workers process public/open literature, not private medical records.

Key pages:
- Homepage: ${siteUrl}/
- Impact: ${siteUrl}/impact
- Volunteer: ${siteUrl}/volunteer
- Download: ${siteUrl}/download
- About: ${siteUrl}/about
- Leaderboards: ${siteUrl}/leaderboards
- Privacy: ${siteUrl}/privacy
- Security: ${siteUrl}/security
- Science disclaimer: ${siteUrl}/science-disclaimer
- Responsible disclosure: ${siteUrl}/responsible-disclosure
- Sitemap: ${siteUrl}/sitemap.xml

Contact:
alan@appassist.ai
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
