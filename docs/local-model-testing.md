# Local model testing workflow

This workflow is for local OpenCause Compute testing on Matt's machine. It is not a volunteer-ready recommendation process yet.

## Model policy

Current local-test default:

- `gemma4:e4b` — current laptop/default candidate for normal worker processing after local bakeoff results.

Not approved / not recommended:

- `llama3.1:8b` — removed from current OpenCause Compute testing after false-positive-heavy bakeoff results.
- `gemma3:4b-it-qat` — removed from current OpenCause Compute testing after false-positive/origin issues.
- `llama3.2:3b` — do not use for claim extraction quality testing except as a negative baseline.

Candidate models to verify locally before any default change:

- `medgemma1.5:4b` — laptop biomedical extractor candidate.
- `qwen3:4b` — laptop general fallback candidate; verify exact Ollama variant.
- `qwen3:14b` — strong laptop/desktop extractor candidate; verify exact variant and latency.
- `gpt-oss:20b` — high-end adjudicator/reasoning candidate.
- `medgemma:27b` — high-end biomedical adjudicator candidate.

NuExtract 2.0 and Mistral Small 3.2 remain high-interest candidates, but do not hard-code them until exact Ollama-compatible tags/artifacts are verified.

## Install Ollama models

From a terminal on the machine running Ollama:

```bash
ollama pull gemma4:e4b
ollama pull medgemma1.5:4b
ollama pull qwen3:4b
ollama pull qwen3:14b
ollama pull gpt-oss:20b
ollama pull medgemma:27b
```

Large models can take a long time and may not fit ordinary laptops. Pull only the models you want to test.

## Run the bakeoff harness

From the repo root:

```bash
npm run local-model:bakeoff -- 
```

To test specific installed models:

```bash
OPENCAUSE_EVAL_MODELS="gemma4:e4b,qwen3:14b,gemma3:12b" \
OPENCAUSE_USE_SCHEMA_FORMAT=true \
OPENCAUSE_MODEL_TIER=laptop \
OLLAMA_ENDPOINT=http://127.0.0.1:11434 \
npm run local-model:bakeoff
```

On PowerShell:

```powershell
$env:OPENCAUSE_EVAL_MODELS="gemma4:e4b,qwen3:14b,gemma3:12b"
$env:OPENCAUSE_USE_SCHEMA_FORMAT="true"
$env:OPENCAUSE_MODEL_TIER="laptop"
$env:OLLAMA_ENDPOINT="http://127.0.0.1:11434"
npm run local-model:bakeoff
```

Results are written under `eval-results/local-model-bakeoff-*.json`.

## Interpret pass/fail

The bakeoff is intentionally conservative. A pass means the model produced strict JSON that normalized successfully and matched the expected behavior for the snippet.

Look at each result for:

- `passed`: overall expected behavior.
- `judgeReason`: why it failed if false.
- `raw`: the original model response.
- `parsed`: parsed JSON.
- `normalized`: normalized `claims-v2` payload.
- `validationErrors`: JSON/schema/normalization failures.
- `evidenceSpanExact`: whether evidence spans appeared verbatim in the source snippet.
- `elapsedMs`: practical latency.

Prefer precision over recall. A good local default should:

1. return zero claims for dose-only, bibliometric, methods, and ambiguous snippets;
2. copy exact evidence spans verbatim;
3. avoid hallucinated fields;
4. distinguish this-study findings from cited/background claims;
5. complete in a practical time for the target hardware.

## Select the desktop processing model

In the desktop app:

1. Open **Models & resources**.
2. Choose an approved fallback or a **candidate / verify locally** model.
3. Download the model if needed.
4. Save settings.
5. Start worker or run one packet now.

Candidate models are allowed for this local tester workflow, but the app labels them as candidates and the worker starts them with `OPENCAUSE_ALLOW_CANDIDATE_LOCAL_MODEL=true`. They are not public-approved defaults.

For normal local processing after bakeoff, use the best model that is both accurate and fast enough on your machine. If in doubt, use `gemma4:e4b` for laptop testing and `qwen3:14b` for stronger desktop/adjudication testing until broader validation changes the recommendation.
