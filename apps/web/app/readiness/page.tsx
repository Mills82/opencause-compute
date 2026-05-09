import { loadDb } from '../../lib/db';
import { publicLaunchReadiness } from '../../lib/readiness/public-launch';

export const dynamic = 'force-dynamic';

export default async function ReadinessPage() {
  const readiness = publicLaunchReadiness(await loadDb());

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Launch readiness</p>
        <h2 className="text-3xl font-semibold">OpenCause Compute go/no-go</h2>
        <p className="text-slate-300">
          Current status: <span className="font-semibold text-white">{readiness.goNoGo}</span>. This page is intentionally
          conservative; private-alpha readiness does not mean broad public launch readiness.
        </p>
      </div>
      <div className="grid gap-3">
        {readiness.items.map((item) => (
          <article key={item.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium">{item.label}</h3>
              <span className={item.status === 'pass' ? 'text-green-300' : item.status === 'warn' ? 'text-yellow-300' : 'text-red-300'}>{item.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
