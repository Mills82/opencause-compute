export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getProjectById } from '../../../lib/queries';
import { validationLevel } from '../../../lib/validation-labels';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProjectById(id);
  if (!data) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">{data.project.name}</h2>
        <p className="text-slate-300">{data.project.description}</p>
      </header>

      <div className="rounded-xl border border-line bg-panel p-4">
        <h3 className="font-medium">Work Packets</h3>
        <ul className="mt-2 space-y-2 text-sm text-slate-200">
          {data.packets.map((packet) => (
            <li key={packet.id}>
              {packet.title} [{packet.status}]
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <h3 className="font-medium">Results</h3>
        <ul className="mt-2 space-y-2 text-sm text-slate-200">
          {data.results.map((result) => (
            <li key={result.id}>
              {result.id} | level: {validationLevel(result)} | hash: {result.resultHash.slice(0, 12)}...
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
