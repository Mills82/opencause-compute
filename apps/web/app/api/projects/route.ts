import { NextResponse } from 'next/server';
import { withDb } from '../../../lib/db';
import { listProjects } from '../../../lib/coordinator';

export async function GET() {
  const projects = await withDb((db) => listProjects(db));
  return NextResponse.json({ projects });
}
