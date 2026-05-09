export default function ScienceDisclaimerPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Science disclaimer</h2>
      <p className="text-slate-300">
        OpenCause Compute produces AI-assisted, citation-backed candidate facts from open scientific literature. Format/schema
        validation only means the output structure and quoted evidence passed automated checks.
      </p>
      <p className="text-slate-300">
        Candidate facts require consensus and/or human review before scientific use. They are not clinical recommendations,
        proven treatment relationships, validated discoveries, or medical advice.
      </p>
      <p className="text-slate-300">
        If you have a medical question, consult a qualified clinician. Do not use OpenCause Compute output to make diagnosis,
        treatment, or care decisions.
      </p>
    </section>
  );
}
