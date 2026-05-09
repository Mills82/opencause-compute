# Model runtime plan

OpenCause Compute should not bundle LLM weights inside the worker installer.

## Public launch model strategy

The installer should include the desktop worker app and supervisor only. On first run, the app should:

1. Check for a supported local runtime, starting with Ollama.
2. Show approved model options with resource guidance.
3. Ask before downloading any model.
4. Show download/progress and disk/resource implications.
5. Verify the model works before allowing normal worker operation.

## Approved models

The shared model manifest lives in `packages/shared/src/model-manifest.ts`.

Current approved options:

- `llama3.2:3b` — default public volunteer model; best first choice for typical laptops/desktops.
- `llama3.1:8b` — stronger optional model for better machines.
- `llama3.3:70b` — large advanced-user option only; not recommended for normal volunteers.
- `llama4:scout` — experimental option; requires validation before recommendation.
- `llama4:maverick` — experimental large option; advanced hardware only.

## Worker enforcement

The worker defaults to `llama3.2:3b` and rejects unapproved model names. Large or experimental models require explicit opt-in flags:

```bash
ALLOW_LARGE_LOCAL_MODEL=true
ALLOW_EXPERIMENTAL_LOCAL_MODEL=true
```

Do not enable those flags by default in public worker builds.

## Why not bundle models?

Bundling model weights would make the installer huge, slow updates, complicate licensing/provenance, and force every volunteer into one resource profile. Separate runtime/model setup keeps the installer lightweight and lets volunteers choose a model appropriate for their machine.
