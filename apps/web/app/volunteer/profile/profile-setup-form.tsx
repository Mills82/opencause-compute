'use client';

import { useEffect, useState } from 'react';

type SetupData = {
  profile: { displayName: string; privacyMode: 'private' | 'public_anonymous' | 'public_named'; publicProfileEnabled: boolean; bio: string; avatarColor: string };
  stats: null | { contributionScore: number; sectionsProcessed: number; formatValidatedSubmissions: number; consensusPassedContributions: number; distinctActiveDays: number };
  latestDigest: null | { previewText: string; periodStart: string; periodEnd: string; sectionsProcessed: number; formatValidatedSubmissions: number; consensusPassedContributions: number; badgesAwarded: number };
  impactCards?: { slug: string; title: string }[];
  badges: { slug: string; awardedAt: string }[];
  teams: { id: string; name: string }[];
};

export function ProfileSetupForm({ token }: { token: string }) {
  const [data, setData] = useState<SetupData | null>(null);
  const [status, setStatus] = useState('Loading profile setup…');
  const [teamId, setTeamId] = useState<string>('');

  useEffect(() => {
    fetch(`/api/volunteer/profile?token=${encodeURIComponent(token)}`).then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'profile_setup_failed');
      setData(json);
      setStatus('');
    }).catch((error) => setStatus(error.message));
  }, [token]);

  if (!data) return <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">{status}</p>;

  async function submit(formData: FormData) {
    setStatus('Saving…');
    const privacyMode = String(formData.get('privacyMode')) as SetupData['profile']['privacyMode'];
    const res = await fetch('/api/volunteer/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        displayName: String(formData.get('displayName') ?? ''),
        privacyMode,
        publicProfileEnabled: privacyMode !== 'private' && formData.get('publicProfileEnabled') === 'on',
        bio: String(formData.get('bio') ?? ''),
        avatarColor: String(formData.get('avatarColor') ?? ''),
        teamId: teamId || null
      })
    });
    const json = await res.json();
    if (!res.ok) return setStatus(json.error ?? 'Save failed');
    setData((current) => current ? { ...current, profile: json.profile } : current);
    setStatus('Saved. Public changes may take a moment to appear on leaderboards.');
  }

  return (
    <div className="space-y-5">
    <div className="grid gap-4 md:grid-cols-4">
      <div className="rounded-xl border border-line bg-panel p-4"><p className="text-2xl font-semibold">{(data.stats?.contributionScore ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Contribution score</p></div>
      <div className="rounded-xl border border-line bg-panel p-4"><p className="text-2xl font-semibold">{(data.stats?.sectionsProcessed ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Literature sections</p></div>
      <div className="rounded-xl border border-line bg-panel p-4"><p className="text-2xl font-semibold">{(data.stats?.formatValidatedSubmissions ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Structure-validated</p></div>
      <div className="rounded-xl border border-line bg-panel p-4"><p className="text-2xl font-semibold">{data.badges.length.toLocaleString()}</p><p className="text-sm text-slate-300">Badges</p></div>
    </div>
    <div className="rounded-xl border border-line bg-panel p-4"><h2 className="font-semibold">Weekly impact preview</h2><p className="mt-2 text-sm text-slate-300">{data.latestDigest?.previewText ?? 'Your impact digest will appear after your worker completes eligible contributions.'}</p></div>
    {data.impactCards?.length ? <div className="rounded-xl border border-line bg-panel p-4"><h2 className="font-semibold">Shareable impact cards</h2><ul className="mt-2 space-y-1 text-sm">{data.impactCards.map((card) => <li key={card.slug}><a className="text-accent" href={`/impact/cards/${card.slug}`}>{card.title}</a></li>)}</ul></div> : null}
    <form action={submit} className="space-y-5 rounded-xl border border-line bg-panel p-5">
      <label className="block text-sm"><span className="text-slate-300">Display name</span><input name="displayName" defaultValue={data.profile.displayName} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white" /></label>
      <label className="block text-sm"><span className="text-slate-300">Bio optional</span><textarea name="bio" defaultValue={data.profile.bio} maxLength={240} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white" /></label>
      <label className="block text-sm"><span className="text-slate-300">Avatar color</span><input name="avatarColor" defaultValue={data.profile.avatarColor} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white" /></label>
      <label className="block text-sm"><span className="text-slate-300">Privacy</span><select name="privacyMode" defaultValue={data.profile.privacyMode} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white"><option value="private">Private — do not appear publicly</option><option value="public_anonymous">Public anonymous — leaderboard only</option><option value="public_named">Public named — leaderboard and profile page</option></select></label>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input name="publicProfileEnabled" type="checkbox" defaultChecked={data.profile.publicProfileEnabled} /> Enable public recognition for non-private modes</label>
      <label className="block text-sm"><span className="text-slate-300">Team optional</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white"><option value="">No team</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <button className="rounded bg-accent px-4 py-2 text-ink" type="submit">Save profile</button>
      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </form>
    </div>
  );
}
