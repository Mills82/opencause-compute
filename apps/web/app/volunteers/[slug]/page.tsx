import { notFound } from 'next/navigation';
import { loadDb } from '../../../lib/db';
import { canShowVolunteerProfile, latestVolunteerStats } from '../../../lib/gamification/public';

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-line bg-panel p-5"><p className="text-3xl font-semibold text-white">{value.toLocaleString()}</p><p className="mt-2 text-sm text-slate-300">{label}</p></div>;
}

function badgeName(slug: string) {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default async function VolunteerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const profile = db.volunteerProfiles.find((candidate) => candidate.slug === slug);
  if (!profile || !canShowVolunteerProfile(profile)) notFound();
  const stats = latestVolunteerStats(db, profile.id);
  const badges = db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id);
  const latestDigest = db.impactDigests.filter((digest) => digest.volunteerProfileId === profile.id).sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
  const cards = db.impactCards.filter((card) => card.volunteerProfileId === profile.id && card.publicEnabled && card.moderationStatus !== 'hidden');

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="h-2" style={{ backgroundColor: profile.avatarColor }} />
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="h-16 w-16 shrink-0 rounded-full" style={{ backgroundColor: profile.avatarColor }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Volunteer profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{profile.displayName}</h1>
              {profile.bio ? <p className="mt-3 max-w-3xl text-slate-300">{profile.bio}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contribution score" value={stats?.contributionScore ?? 0} />
        <Stat label="Paper sections processed" value={stats?.sectionsProcessed ?? 0} />
        <Stat label="Format-validated submissions" value={stats?.formatValidatedSubmissions ?? 0} />
        <Stat label="Consensus-passed candidate facts" value={stats?.consensusPassedContributions ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Recent impact</h2>
          <p className="mt-2 text-slate-300">{latestDigest?.previewText ?? 'Recent impact will appear after eligible contributions.'}</p>
          {cards.length ? <div className="mt-4 flex flex-wrap gap-2">{cards.map((card) => <a key={card.slug} className="rounded border border-line px-3 py-2 text-sm hover:border-accent hover:no-underline" href={`/impact/cards/${card.slug}`}>Share card</a>)}</div> : null}
        </div>

        <div className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Badges</h2>
          {badges.length ? (
            <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
              {badges.map((badge) => <li key={badge.badgeSlug} className="rounded-full border border-line bg-ink px-3 py-1">{badgeName(badge.badgeSlug)}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-300">Badges will appear after eligible contributions.</p>}
        </div>
      </div>

      <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">Recognition metrics describe candidate extraction and validation work. They are not medical conclusions or clinical findings.</p>
      <a className="text-sm text-slate-400 underline" href={`/report-public-content?targetType=volunteer_profile&targetSlug=${profile.slug}`}>Report this profile</a>
    </section>
  );
}
