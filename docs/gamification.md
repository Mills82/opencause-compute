# OpenCause Compute gamification and impact recognition

OpenCause Compute uses gamification as impact recognition, not as a compute arms race.

The system is designed to help volunteers understand what their idle computer helped process, recognize reliable contribution, and support optional teams while preserving scientific caution and volunteer privacy.

## What contribution score means

Contribution score is a product metric for recognizing useful participation. It is not money, a token, scientific truth, medical advice, or a claim that a candidate fact has been accepted by researchers.

V1 scoring is centralized in the shared gamification module:

```text
baseWorkScore =
  formatValidatedSubmissions * 5
+ consensusPassedContributions * 20
+ humanReviewedAcceptedContributions * 50
+ distinctActiveDays * 10
- formatRejectedSubmissions * 3
- consensusFailedContributions * 5

idleScoreRaw = floor(idleMinutesDonated / 60)
idleScore = capped idleScoreRaw
contributionScore = max(0, baseWorkScore + idleScore)
```

Raw idle time is capped so leaderboards reward validated open-science work, not electricity use.

## Safe language

Use:

- paper sections processed
- format-validated submissions
- consensus-passed candidate facts
- reviewed contributions
- idle minutes donated

Avoid:

- discoveries
- cures
- proven cancer facts
- clinical findings

## Privacy

Volunteer profiles are separate from operational worker nodes. New node registrations create or attach to a volunteer profile, but profiles default to private.

Public leaderboards include only volunteers who opt into public recognition. Private profiles are excluded. Anonymous public volunteers can appear without exposing a named profile page.

Public APIs must serialize explicit public DTOs and must never expose node tokens, enrollment codes, email addresses, IP addresses, raw operational node IDs, or private profile names.

## Badges

V1 badge definitions cover getting started, milestones, reliability, Cancer Knowledge Miner participation, and team participation. Badge awards are idempotent with a unique volunteer/profile badge relationship.

Deferred badges include founding volunteer/team badges and resource-setting badges until public-beta policy and telemetry are clearer.

## Teams and leaderboards

Teams are optional and can represent schools, companies, families, cities, open-source communities, survivor communities, research supporters, or civic groups.

Public team leaderboards aggregate eligible active member contribution. Private teams are excluded from public leaderboards.

## Anti-abuse guardrails

The recognition layer should not count:

- claim-only activity
- suspended or revoked nodes
- duplicate node submissions for the same packet
- format-invalid submissions as positive contribution
- private profile data in public APIs

Future abuse signals should flag high failure rates, excessive claim pressure with low submission rate, repeated identical outputs, suspicious registration bursts, and unusually bursty contribution patterns.

## Admin controls

Protected admin APIs can review and configure the recognition layer before public self-service exists:

- `GET /api/admin/gamification`
- `PATCH /api/admin/gamification/profiles/:profileId`
- `POST /api/admin/gamification/teams`
- `POST /api/admin/gamification/teams/:teamId/members`
- `POST /api/admin/gamification/recompute`

The admin dashboard links to `/admin/gamification` for a protected setup/status view. These endpoints are intended for operator setup and QA, not public volunteer account management.

## Shareable impact cards

Recompute can generate public-safe impact cards for opted-in public volunteer profiles and public teams. Cards live under `/impact/cards/:slug` and expose only safe summary metrics/copy. They do not auto-post anywhere and do not include emails, node IDs, enrollment codes, private profile names, raw packet IDs, or medical/scientific overclaims.

## Current V1 limitations

- Volunteer profile setup uses a registration-issued setup token rather than a full account system. This is suitable for selected beta testers, but broader public launch should still add account/session recovery, token rotation, and abuse/moderation UX.
- Weekly impact digest previews are generated for profile/setup surfaces, but email digests are not sent in V1.
- Idle-minute donation is schema/scoring-ready but remains zero until trustworthy worker telemetry exists.
- Weekly/monthly windows are schema-ready but all-time is the first implemented public window.
