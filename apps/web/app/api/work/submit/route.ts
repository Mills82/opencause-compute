import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resultPayloadSchema, resultProvenanceSchema } from '@opencause/shared';
import { submitResult } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { extractNodeToken, isNodeAuthorized } from '../../../../lib/node-auth';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';
import { submitResultRelational } from '../../../../lib/relational-worker';

const requestSchema = z.object({
  nodeId: z.string().min(1),
  claimId: z.string().min(1),
  workPacketId: z.string().min(1),
  extractorVersion: z.enum(['Local LLM v1', 'Mock Extractor v1']),
  result: resultPayloadSchema,
  provenance: resultProvenanceSchema.optional()
});

const ALLOW_MOCK_RESULTS = process.env.ALLOW_MOCK_RESULTS === 'true';

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limit = await checkNamedRateLimitAsync(request, 'workSubmit', parsed.data.nodeId);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  if (parsed.data.extractorVersion === 'Mock Extractor v1' && !ALLOW_MOCK_RESULTS) {
    return NextResponse.json(
      { error: 'mock_results_not_allowed', message: 'Mock extractor results are disabled in release mode.' },
      { status: 403 }
    );
  }

  try {
    const token = extractNodeToken(request);
    const relationalOutput = await submitResultRelational({ ...parsed.data, token });
    const output = relationalOutput !== undefined ? relationalOutput : await withDb((db) => {
      if (!isNodeAuthorized(db, parsed.data.nodeId, token)) throw new Error('node_unauthorized');
      return submitResult(db, parsed.data);
    });
    return NextResponse.json({
      result: output.record,
      facts: output.facts,
      workPacket: output.workPacket
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'submit_failed';
    if (message === 'node_revoked' || message === 'node_suspended') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: message === 'node_unauthorized' ? 401 : 400 });
  }
}
