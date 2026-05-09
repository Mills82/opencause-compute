import { notFound } from 'next/navigation';
import { loadDb } from '../../../lib/db';
import { canShowVolunteerProfile, latestVolunteerStats } from '../../../lib/gamification/public';

export default async function VolunteerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const profile = db.volunteerProfiles.find((candidate) => candidate.slug === slug);
  if (!profile || !canShowVolunteerProfile(profile)) notFound();
  const stats = latestVolunteerStats(db, profile.id);
  const badges = db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id);
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-line bg-panel p-6">
        <div className="mb-4 h-12 w-12 rounded-full" style={{ backgroundColor: profile.avatarColor }} />
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Volunteer profile</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{profile.displayName}</h1>
        {profile.bio ? <p className="mt-3 text-slate-300">{profile.bio}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.contributionScore ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Contribution score</p></div>
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.sectionsProcessed ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Paper sections processed</p></div>
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.formatValidatedSubmissions ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Format-validated submissions</p></div>
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.consensusPassedContributions ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Consensus-passed candidate facts</p></div>
      </div>
      <div className="rounded-xl border border-line bg-panel p-5"><h2 className="text-xl font-semibold">Badges</h2>{badges.length ? <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">{badges.map((badge) => <li key={badge.badgeSlug} className="rounded-full border border-line px-3 py-1">{badge.badgeSlug}</li>)}</ul> : <p className="mt-2 text-sm text-slate-300">Badges will appear after eligible contributions.</p>}</div>
    </section>
  );
}
