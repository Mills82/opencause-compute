export default function DownloadPage() {
  const windowsUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL;
  const checksumUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_CHECKSUM_URL;
  const releaseNotesUrl = process.env.NEXT_PUBLIC_WINDOWS_WORKER_RELEASE_NOTES_URL;
  const isPrototype = process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE !== 'public';

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Worker download</p>
        <h2 className="text-3xl font-semibold">Download the OpenCause Compute Worker.</h2>
        <p className="text-slate-300">
          The worker app lets volunteers contribute spare compute to open science projects. It verifies signed work packets,
          keeps activity visible, and returns citation-backed candidate facts with provenance.
        </p>
        <p className="text-slate-300">
          Worker output is research-support evidence. It is not medical advice and should not be used for diagnosis, treatment,
          or care decisions.
        </p>
      </div>

      <article className="rounded-xl border border-line bg-panel p-5">
        <h3 className="text-lg font-medium">Windows worker</h3>
        {windowsUrl ? (
          <div className="mt-3 space-y-3 text-sm text-slate-300">
            {isPrototype ? (
              <div className="rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-yellow-100">
                This is a prototype build for testing. Only install it on a machine you are comfortable using for QA.
              </div>
            ) : null}
            <a className="inline-block rounded bg-accent px-4 py-2 text-ink" href={windowsUrl}>
              Download Windows worker
            </a>
            <ul className="list-disc space-y-1 pl-6">
              <li>Verify checksums before installing.</li>
              <li>Use the worker only on a computer you control.</li>
              <li>Keep activity logs visible and pause the worker any time you need the machine back.</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              {checksumUrl ? <a href={checksumUrl}>SHA256 checksums</a> : null}
              {releaseNotesUrl ? <a href={releaseNotesUrl}>Release notes</a> : null}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded border border-line bg-ink p-4 text-sm text-slate-300">
            A public worker download is not available yet. We are completing installer, signing, and QA checks before publishing
            the download link.
          </div>
        )}
      </article>

      <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <h3 className="text-lg font-medium text-white">What to expect</h3>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>You can pause worker activity and view logs.</li>
          <li>The worker stores credentials and logs in its app data directory.</li>
          <li>The worker is designed to process open/public literature, not your personal files.</li>
          <li>Your computer may use electricity, network, CPU, and memory while contributing.</li>
        </ul>
      </article>
    </section>
  );
}
