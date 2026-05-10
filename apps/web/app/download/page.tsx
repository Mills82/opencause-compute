export default function DownloadPage() {
  const windowsUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL;
  const checksumUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_CHECKSUM_URL;
  const releaseNotesUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_RELEASE_NOTES_URL;
  const isEarlyAccess = process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE !== 'public';

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_36%)]" />
        <div className="relative max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Worker download</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Download the OpenCause Compute Worker.</h1>
          <p className="text-slate-300">
            The worker app lets volunteers contribute spare compute to open science projects. It verifies signed work packets,
            keeps activity visible, and returns citation-backed evidence candidates with provenance.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-xl border border-line bg-panel p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-medium">Windows worker</h2>
              <p className="mt-1 text-sm text-slate-300">Early-access desktop worker for limited beta volunteers.</p>
            </div>
            {isEarlyAccess ? <span className="w-fit rounded-full border border-yellow-500/60 px-3 py-1 text-xs font-semibold text-yellow-100">Early access</span> : null}
          </div>
          {windowsUrl ? (
            <div className="mt-5 space-y-4 text-sm text-slate-300">
              {isEarlyAccess ? (
                <div className="rounded border border-yellow-500/50 bg-yellow-500/10 p-3 leading-6 text-yellow-100">
                  Early-access Windows build. Windows may show a SmartScreen warning until installer signing is complete. Please verify the checksum before installing.
                </div>
              ) : null}
              <a className="block rounded bg-accent px-5 py-3 text-center font-semibold text-ink hover:no-underline sm:inline-block" href={windowsUrl}>
                Download Windows worker
              </a>
              <div className="flex flex-wrap gap-3">
                {checksumUrl ? <a className="rounded border border-line px-3 py-2 hover:border-accent hover:no-underline" href={checksumUrl}>SHA256 checksums</a> : null}
                {releaseNotesUrl ? <a className="rounded border border-line px-3 py-2 hover:border-accent hover:no-underline" href={releaseNotesUrl}>Release notes</a> : null}
                <a className="rounded border border-line px-3 py-2 hover:border-accent hover:no-underline" href="/responsible-disclosure">Report a security issue</a>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded border border-line bg-ink p-4 text-sm text-slate-300">
              A public worker download is not available yet. We are completing installer, signing, and compatibility checks before publishing
              the download link.
            </div>
          )}
        </article>

        <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
          <h2 className="text-xl font-medium text-white">Before you install</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 leading-6">
            <li>Use the worker only on a computer you control.</li>
            <li>Verify checksums before installing when possible.</li>
            <li>You can pause worker activity, tune resource usage, and view logs.</li>
            <li>The worker processes open/public literature, not personal files.</li>
            <li>Worker output is research-support evidence for review, not medical advice.</li>
          </ul>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="text-lg font-semibold text-white">What the worker can access</h2>
          <p className="mt-2">The worker receives signed OpenCause work packets, runs a local extraction model, and submits structured evidence, citations, logs, and provenance needed to verify the contribution.</p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="text-lg font-semibold text-white">What it should not access</h2>
          <p className="mt-2">The worker is designed for public/open literature processing. It should not read private medical records, personal documents, emails, browser history, or unrelated local files.</p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="text-lg font-semibold text-white">You stay in control</h2>
          <p className="mt-2">The desktop app lets you pause work, run only while idle, limit CPU use, avoid battery work, inspect activity, and remove local worker data when needed.</p>
        </article>
      </div>

      <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <h2 className="text-xl font-medium text-white">What happens after setup?</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div><p className="font-medium text-accent">Register</p><p>Use your one-time enrollment code to attach this computer to your volunteer profile.</p></div>
          <div><p className="font-medium text-accent">Choose resources</p><p>Select model quality, idle behavior, CPU limits, and when the worker may run.</p></div>
          <div><p className="font-medium text-accent">Process packets</p><p>The worker claims signed packets, runs local extraction, and submits structured evidence for validation.</p></div>
        </div>
      </article>
    </section>
  );
}
