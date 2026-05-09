export default function DownloadPage() {
  const windowsUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL;
  const checksumUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_CHECKSUM_URL;
  const releaseNotesUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_RELEASE_NOTES_URL;
  const isPrototype = process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE !== 'public';

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Desktop worker download</p>
        <h2 className="text-3xl font-semibold">OpenCause Compute Worker</h2>
        <p className="text-slate-300">
          The desktop worker lets volunteers contribute idle compute to AI-assisted open science. It processes open-access/public
          literature packets and returns citation-backed candidate facts with provenance.
        </p>
        <p className="text-slate-300">
          Results require consensus and/or human review before scientific use. OpenCause Compute is not medical advice.
        </p>
      </div>

      <article className="rounded-xl border border-line bg-panel p-5">
        <h3 className="text-lg font-medium">Windows worker</h3>
        {windowsUrl ? (
          <div className="mt-3 space-y-3 text-sm text-slate-300">
            {isPrototype ? (
              <div className="rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-yellow-100">
                Prototype artifact only. Do not treat this as a signed public release.
              </div>
            ) : null}
            <a className="inline-block rounded bg-accent px-4 py-2 text-ink" href={windowsUrl}>
              Download Windows worker
            </a>
            <ul className="list-disc space-y-1 pl-6">
              <li>Verify checksums before testing.</li>
              <li>Only install prototype builds on machines intended for QA.</li>
              <li>Do not use worker output as medical advice or validated scientific findings.</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              {checksumUrl ? <a href={checksumUrl}>SHA256 checksums</a> : null}
              {releaseNotesUrl ? <a href={releaseNotesUrl}>Prototype release notes</a> : null}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded border border-line bg-ink p-4 text-sm text-slate-300">
            No public worker download is configured yet. The Windows prototype artifact can be built through GitHub Actions, but
            it should not be posted here until checksum, signing/unsigned status, and QA expectations are clear.
          </div>
        )}
      </article>

      <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <h3 className="text-lg font-medium text-white">Before installing</h3>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>You should be able to pause/resume work and see activity logs.</li>
          <li>The worker should store credentials/logs in its app data directory.</li>
          <li>The worker should not access personal files outside its app data directory.</li>
          <li>Volunteer electricity, network, and hardware resources may be used.</li>
        </ul>
      </article>
    </section>
  );
}
