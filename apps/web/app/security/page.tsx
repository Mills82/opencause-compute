export default function SecurityPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Security</h2>
      <p className="text-slate-300">
        OpenCause Compute uses signed work packets, worker enrollment codes, node tokens, protected coordinator pages, and audit
        events to help keep the volunteer network accountable.
      </p>
      <ul className="list-disc space-y-2 pl-6 text-slate-300">
        <li>Workers verify coordinator-signed packets with a public key.</li>
        <li>The coordinator private signing key is not distributed to volunteers.</li>
        <li>Suspended or revoked nodes cannot heartbeat, claim, or submit work.</li>
        <li>Coordinator dashboards and internal APIs require admin access.</li>
        <li>Worker activity should remain visible to the volunteer.</li>
      </ul>
      <p className="text-slate-300">
        Security hardening is ongoing. Public worker releases require installer signing, clean-machine QA, and continued review
        of worker sandbox and resource controls.
      </p>
    </section>
  );
}
