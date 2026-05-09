import { ReportPublicContentForm } from './report-form';

export default async function ReportPublicContentPage({ searchParams }: { searchParams: Promise<{ targetType?: string; targetSlug?: string }> }) {
  const params = await searchParams;
  const targetType = params.targetType ?? '';
  const targetSlug = params.targetSlug ?? '';
  const valid = ['volunteer_profile', 'team', 'impact_card'].includes(targetType) && targetSlug.length > 0;
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Report public content</p>
        <h1 className="text-4xl font-semibold tracking-tight">Help keep OpenCause recognition safe.</h1>
        <p className="text-slate-300">Use this for offensive names, misleading content, privacy concerns, or other public-recognition issues.</p>
      </div>
      {valid ? <ReportPublicContentForm targetType={targetType} targetSlug={targetSlug} /> : <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">Missing or invalid report target.</p>}
    </section>
  );
}
