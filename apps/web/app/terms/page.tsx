export default function TermsPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Terms</h2>
      <p className="text-slate-300">
        Participation in OpenCause Compute is voluntary. You may pause or stop the worker, and administrators may suspend or
        revoke nodes to protect the network.
      </p>
      <p className="text-slate-300">
        Volunteers are responsible for electricity, network, and hardware usage from running a worker. Prototype builds should
        be installed only on machines you are comfortable using for testing.
      </p>
      <p className="text-slate-300">
        OpenCause Compute is not a medical device, clinical tool, or source of medical advice. Candidate extractions should keep
        citations and provenance and should not be treated as validated scientific conclusions on their own.
      </p>
    </section>
  );
}
