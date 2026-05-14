import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractNodeToken } from '../../../../lib/node-auth';
import { issueNodeProfileSetupTokenLocal } from '../../../../lib/profile-setup-link';
import { issueNodeProfileSetupTokenRelational } from '../../../../lib/relational-app';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';

const requestSchema = z.object({
  nodeId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const limit = await checkNamedRateLimitAsync(request, 'nodeHeartbeat', parsed.data.nodeId);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const token = extractNodeToken(request);
  try {
    const relationalToken = await issueNodeProfileSetupTokenRelational(parsed.data.nodeId, token);
    const profileSetupToken = relationalToken ?? await issueNodeProfileSetupTokenLocal(parsed.data.nodeId, token);
    return NextResponse.json({ profileSetupToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'profile_setup_link_failed';
    const status = message === 'node_unauthorized' || message === 'node_not_found' || message === 'node_revoked' || message === 'node_suspended' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
