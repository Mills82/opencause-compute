import { NextResponse } from 'next/server';
import { z } from 'zod';
import { registerNode } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';

const requestSchema = z.object({
  nodeName: z.string().min(1),
  platform: z.string().min(1),
  version: z.string().min(1),
  capabilities: z.array(z.string()).default([])
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const registration = await withDb((db) => registerNode(db, parsed.data));
  return NextResponse.json(registration);
}
