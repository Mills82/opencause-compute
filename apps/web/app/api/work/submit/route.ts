import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resultPayloadSchema } from '@opencause/shared';
import { submitResult } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';

const requestSchema = z.object({
  nodeId: z.string().min(1),
  claimId: z.string().min(1),
  workPacketId: z.string().min(1),
  result: resultPayloadSchema
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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
