export default function ResponsibleDisclosurePage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Responsible disclosure</h2>
      <p className="text-slate-300">
        If you find a security issue, please report it privately before sharing details publicly. Include the affected route or
        component, reproduction steps, likely impact, and any relevant logs or screenshots.
      </p>
      <p className="text-slate-300">
        Contact: <a href="mailto:security@appassist.ai?subject=OpenCause%20Compute%20security%20report">security@appassist.ai</a>
      </p>
      <p className="text-slate-300">
        We prioritize reports involving authentication bypass, node-token compromise, forged work packets, admin access, data
        leakage, unrestricted resource consumption, or worker safety issues.
      </p>
    </section>
  );
}
