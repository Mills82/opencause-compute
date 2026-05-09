import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resultPayloadSchema } from '@opencause/shared';
import { submitResult } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';

const requestSchema = z.object({
  nodeId: z.string().min(1),
  claimId: z.string().min(1),
  workPacketId: z.string().min(1),
  extractorVersion: z.enum(['Local LLM v1', 'Mock Extractor v1']),
  result: resultPayloadSchema
});

const ALLOW_MOCK_RESULTS = process.env.ALLOW_MOCK_RESULTS === 'true';

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.extractorVersion === 'Mock Extractor v1' && !ALLOW_MOCK_RESULTS) {
    return NextResponse.json(
      { error: 'mock_results_not_allowed', message: 'Mock extractor results are disabled in release mode.' },
      { status: 403 }
    );
  }

  try {
    const output = await withDb((db) => submitResult(db, parsed.data));
    return NextResponse.json({
      result: output.record,
      facts: output.facts,
      workPacket: output.workPacket
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'submit_failed' }, { status: 400 });
  }
}
