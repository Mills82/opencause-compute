export default function SecurityPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Security</h2>
      <p className="text-slate-300">
        OpenCause Compute uses invite-based worker enrollment, node tokens for worker API authentication, protected admin
        routes, and asymmetric Ed25519 work-packet signatures in hosted mode.
      </p>
      <ul className="list-disc space-y-2 pl-6 text-slate-300">
        <li>Workers verify coordinator-signed packets with a public key.</li>
        <li>Coordinator private signing keys are not distributed to volunteers.</li>
        <li>Suspended or revoked nodes cannot heartbeat, claim, or submit work.</li>
        <li>Admin pages and coordinator read APIs are not public surfaces.</li>
        <li>Local worker logs should remain visible to the volunteer.</li>
      </ul>
      <p className="text-slate-300">
        This is still private-alpha software. Public launch still requires stronger packaging, sandboxing, audit logs, rate
        limiting, incident response, and consensus validation.
      </p>
    </section>
  );
}
