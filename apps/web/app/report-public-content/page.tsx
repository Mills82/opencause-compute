import { ReportPublicContentForm } from './report-form';

const labels: Record<string, string> = {
  volunteer_profile: 'volunteer profile',
  team: 'team',
  impact_card: 'impact card'
};

export default async function ReportPublicContentPage({ searchParams }: { searchParams: Promise<{ targetType?: string; targetSlug?: string }> }) {
  const params = await searchParams;
  const targetType = params.targetType ?? '';
  const targetSlug = params.targetSlug ?? '';
  const valid = ['volunteer_profile', 'team', 'impact_card'].includes(targetType) && targetSlug.length > 0;
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Report public content</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Help keep OpenCause recognition safe.</h1>
          <p className="text-slate-300">Use this for offensive names, misleading content, privacy concerns, or other public-recognition issues.</p>
        </div>
      </div>
      {valid ? (
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
            <p className="font-medium text-white">Report target</p>
            <p className="mt-2 capitalize">{labels[targetType] ?? targetType}</p>
            <p className="break-all text-slate-400">{targetSlug}</p>
            <p className="mt-4">Reports go to OpenCause operators for review. Public content may be hidden while reviewed.</p>
          </aside>
          <ReportPublicContentForm targetType={targetType} targetSlug={targetSlug} />
        </div>
      ) : <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">Missing or invalid report target.</p>}
    </section>
  );
}
