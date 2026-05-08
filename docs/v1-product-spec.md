# OpenCause Compute V1 Product Spec (Source Copy)

## Product concept

OpenCause Compute is a modern volunteer-compute platform for AI-assisted open science.

Volunteers run a desktop/worker app while idle. Their machines process vetted science work packets and return structured results.

V1 initial project:
- Cancer Knowledge Miner: process open-access cancer/biomedical text into structured, citation-backed facts via local/mock extraction.

Positioning constraints:
- Do not frame as curing cancer with an LLM.
- Do not make medical claims.
- Do frame as donating idle compute to AI-powered open science.
- Goal is infrastructure + credible demo, not validated discoveries.

## V1 vertical slice proof points

1. Web coordinator creates and stores work packets.
2. Volunteer node registers.
3. Worker claims packet.
4. Worker verifies packet signature.
5. Worker runs approved mock extractor.
6. Worker submits structured results.
7. Coordinator validates result.
8. Dashboard displays projects, packets, nodes, results, facts, validation status.

## Core entities

- Project
- WorkPacket
- VolunteerNode
- WorkClaim
- ExtractionResult
- ExtractedFact

V1 result JSON:
- `{ facts: [{ cancerType?, geneOrBiomarker?, drugOrCompound?, relationshipType, evidenceSentence, confidence }], summary, warnings }`

Allowed relationship types:
- `associated_with_response`
- `associated_with_resistance`
- `associated_with_risk`
- `associated_with_progression`
- `studied_with`
- `unclear`

## Security requirements

- Work packets are data only.
- No arbitrary code execution.
- Worker runs bundled approved mock extractor only.
- Packets signed server-side, verified worker-side.
- HMAC acceptable in V1 but isolated for asymmetric swap.
- Hash source text and result JSON.
- Worker stays in app data dir.
- No inbound ports and no local LLM server.
- Visible activity log.
- Document limits and hardening roadmap.

## Validation requirements

- Schema validation.
- Evidence sentence appears in source text.
- Confidence in [0..1].
- Relationship enum enforced.
- Citation/source metadata preserved.
- Result hash recorded.
- Valid V1 results marked validated.
- Duplicate-result consensus validation deferred to V2.

## UI routes

- `/`
- `/projects`
- `/projects/[id]`
- `/work-packets`
- `/results`
- `/nodes`
- `/about`

## Implementation priority

- Inspect/scaffold/shared schemas/db/seed/API/signing/mock extractor/worker/connect/dashboard/tests/docs/run checks.
- Prioritize working demo over perfect architecture.
