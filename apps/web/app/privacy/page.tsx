export default function PrivacyPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Privacy</h2>
      <p className="text-slate-300">
        OpenCause Compute is built for volunteer processing of open-access/public research literature. The worker is not designed
        to process private medical records or personal documents.
      </p>
      <div className="space-y-2 text-slate-300">
        <h3 className="font-semibold text-white">What the worker sends back</h3>
        <p>
          Workers submit evidence candidates, summaries, validation warnings, node identifiers, worker version, platform/capability
          metadata, and model/extractor provenance needed for auditability.
        </p>
        <h3 className="font-semibold text-white">Local files</h3>
        <p>
          The worker should use its app data directory for credentials and logs. It should not read personal files or documents
          outside its configured app data directory.
        </p>
        <h3 className="font-semibold text-white">Operational records</h3>
        <p>
          The coordinator records events needed to run the system: enrollment, registration, heartbeat, work claims, submissions,
          validation, and admin actions.
        </p>
      </div>
    </section>
  );
}
