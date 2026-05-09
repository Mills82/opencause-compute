import { ProfileSetupForm } from './profile-setup-form';

export default async function VolunteerProfileSetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Volunteer profile</p>
        <h1 className="text-4xl font-semibold tracking-tight">Choose how you appear in OpenCause recognition.</h1>
        <p className="text-slate-300">Profiles default to private. You can opt into anonymous or named public recognition, and you can change this later with your setup link.</p>
      </div>
      {token ? <ProfileSetupForm token={token} /> : <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">Open this page from your worker registration profile setup link.</p>}
      <p className="text-sm text-slate-400">OpenCause recognition metrics describe candidate extraction and validation work, not medical conclusions or clinical findings.</p>
    </section>
  );
}
