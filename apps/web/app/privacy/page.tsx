export default function PrivacyPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Privacy</h2>
      <p className="text-slate-300">
        OpenCause Compute is a private-alpha volunteer-compute system for AI-assisted open science. Workers process
        coordinator-assigned open-access/public literature packets, not private medical records.
      </p>
      <div className="space-y-2 text-slate-300">
        <h3 className="font-semibold text-white">What the worker sends back</h3>
        <p>
          Workers submit citation-backed candidate facts, summaries, validation warnings, node identifiers, worker version,
          platform/capability metadata, and model/extractor provenance needed for auditability.
        </p>
        <h3 className="font-semibold text-white">Local files</h3>
        <p>
          The worker is intended to use its app data directory for credentials and logs. It should not read personal files or
          documents outside its own configured app data directory.
        </p>
        <h3 className="font-semibold text-white">Telemetry</h3>
        <p>
          The coordinator records operational events needed to run the private alpha: registration, heartbeat, claim, submit,
          validation, and admin activity. Do not install the worker unless you are comfortable contributing compute resources.
        </p>
      </div>
    </section>
  );
}
