export const dynamic = 'force-dynamic';

import { loadDb } from '../../../lib/db';
import { listGamificationAdmin } from '../../../lib/gamification/admin';

export default async function AdminGamificationPage() {
  const data = listGamificationAdmin(await loadDb());
  return (
    <section className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Admin</p>
        <h1 className="text-3xl font-semibold">Gamification controls</h1>
        <p className="text-slate-300">Protected setup view for volunteer profiles, privacy posture, teams, badges, and recompute status. Public self-service profile/team management is intentionally not live yet.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-4"><p className="text-sm text-slate-300">Volunteer profiles</p><p className="text-2xl font-semibold text-accent">{data.profiles.length}</p></article>
        <article className="rounded-xl border border-line bg-panel p-4"><p className="text-sm text-slate-300">Public profiles</p><p className="text-2xl font-semibold text-accent">{data.profiles.filter((profile) => profile.publicProfileEnabled && profile.privacyMode !== 'private').length}</p></article>
        <article className="rounded-xl border border-line bg-panel p-4"><p className="text-sm text-slate-300">Teams</p><p className="text-2xl font-semibold text-accent">{data.teams.length}</p></article>
      </div>

      <article className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-medium">Profiles</h2><p className="text-sm text-slate-300">Defaults remain private until explicitly changed through protected admin APIs.</p></div>
          <a className="rounded border border-line px-3 py-2 text-sm" href="/api/admin/gamification">JSON</a>
        </div>
        {data.profiles.length ? (
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-300"><tr><th className="py-2">Display</th><th>Privacy</th><th>Public</th><th>Nodes</th><th>Score</th><th>Badges</th></tr></thead><tbody>{data.profiles.map((profile) => <tr key={profile.id} className="border-t border-line/70 text-slate-300"><td className="py-2 text-white">{profile.displayName}<br/><span className="text-xs text-slate-400">{profile.slug}</span></td><td>{profile.privacyMode}</td><td>{String(profile.publicProfileEnabled)}</td><td>{profile.nodes.length}</td><td>{profile.stats?.contributionScore ?? 0}</td><td>{profile.badges.length}</td></tr>)}</tbody></table></div>
        ) : <p className="mt-4 text-sm text-slate-300">No volunteer profiles yet. Node registration will create private profiles automatically.</p>}
      </article>

      <article className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-lg font-medium">Teams</h2>
        {data.teams.length ? (
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-300"><tr><th className="py-2">Team</th><th>Visibility</th><th>Members</th><th>Score</th><th>Public page</th></tr></thead><tbody>{data.teams.map((team) => <tr key={team.id} className="border-t border-line/70 text-slate-300"><td className="py-2 text-white">{team.name}<br/><span className="text-xs text-slate-400">{team.slug}</span></td><td>{team.visibility}</td><td>{team.memberships.filter((m) => m.status === 'active').length}</td><td>{team.stats?.contributionScore ?? 0}</td><td>{team.visibility === 'public' ? <a className="text-accent" href={`/teams/${team.slug}`}>Open</a> : '—'}</td></tr>)}</tbody></table></div>
        ) : <p className="mt-4 text-sm text-slate-300">No teams yet. Create teams through the protected admin API while public self-service is deferred.</p>}
      </article>

      <article className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">
        <h2 className="text-lg font-medium text-white">Protected API examples</h2>
        <pre className="mt-3 overflow-x-auto rounded border border-line/70 p-3">{`PATCH /api/admin/gamification/profiles/:profileId
{ "displayName": "Volunteer Name", "privacyMode": "public_named", "publicProfileEnabled": true }

POST /api/admin/gamification/teams
{ "name": "Example Team", "visibility": "public" }

POST /api/admin/gamification/teams/:teamId/members
{ "volunteerProfileId": "...", "role": "member", "status": "active" }

POST /api/admin/gamification/recompute`}</pre>
      </article>
    </section>
  );
}
