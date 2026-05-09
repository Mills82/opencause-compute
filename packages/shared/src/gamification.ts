export type ContributionScoreInput = {
  formatValidatedSubmissions: number;
  consensusPassedContributions: number;
  humanReviewedAcceptedContributions: number;
  distinctActiveDays: number;
  idleMinutesDonated: number;
  formatRejectedSubmissions: number;
  consensusFailedContributions: number;
};

export type ContributionScoreBreakdown = {
  baseWorkScore: number;
  idleScoreRaw: number;
  idleScoreCap: number;
  idleScore: number;
  contributionScore: number;
};

function wholeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function calculateContributionScore(input: ContributionScoreInput): ContributionScoreBreakdown {
  const formatValidatedSubmissions = wholeNumber(input.formatValidatedSubmissions);
  const consensusPassedContributions = wholeNumber(input.consensusPassedContributions);
  const humanReviewedAcceptedContributions = wholeNumber(input.humanReviewedAcceptedContributions);
  const distinctActiveDays = wholeNumber(input.distinctActiveDays);
  const idleMinutesDonated = wholeNumber(input.idleMinutesDonated);
  const formatRejectedSubmissions = wholeNumber(input.formatRejectedSubmissions);
  const consensusFailedContributions = wholeNumber(input.consensusFailedContributions);

  const baseWorkScore =
    formatValidatedSubmissions * 5 +
    consensusPassedContributions * 20 +
    humanReviewedAcceptedContributions * 50 +
    distinctActiveDays * 10 -
    formatRejectedSubmissions * 3 -
    consensusFailedContributions * 5;
  const idleScoreRaw = Math.floor(idleMinutesDonated / 60);
  const positiveBase = Math.max(0, baseWorkScore);
  const idleScoreCap = Math.floor((positiveBase + idleScoreRaw) * 0.25);
  const idleScore = Math.min(idleScoreRaw, idleScoreCap);
  const contributionScore = Math.max(0, baseWorkScore + idleScore);
  return { baseWorkScore, idleScoreRaw, idleScoreCap, idleScore, contributionScore };
}

export type BadgeDefinition = {
  slug: string;
  name: string;
  description: string;
  category: 'getting_started' | 'milestone' | 'reliability' | 'mission' | 'community';
  criteriaKind: string;
  criteriaValue: number;
  iconName?: string;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { slug: 'first-packet-processed', name: 'First Packet Processed', description: 'Submitted a first work packet.', category: 'getting_started', criteriaKind: 'packetsSubmitted', criteriaValue: 1, iconName: 'spark' },
  { slug: 'first-format-validated-submission', name: 'First Format-Validated Submission', description: 'Submitted a result that passed schema and evidence format validation.', category: 'getting_started', criteriaKind: 'formatValidatedSubmissions', criteriaValue: 1, iconName: 'check' },
  { slug: 'first-consensus-match', name: 'First Consensus Match', description: 'Contributed to a consensus-passed candidate fact.', category: 'getting_started', criteriaKind: 'consensusPassedContributions', criteriaValue: 1, iconName: 'link' },
  { slug: '100-sections-processed', name: '100 Sections Processed', description: 'Processed 100 open-access paper sections.', category: 'milestone', criteriaKind: 'sectionsProcessed', criteriaValue: 100 },
  { slug: '1000-sections-processed', name: '1,000 Sections Processed', description: 'Processed 1,000 open-access paper sections.', category: 'milestone', criteriaKind: 'sectionsProcessed', criteriaValue: 1000 },
  { slug: '10000-sections-processed', name: '10,000 Sections Processed', description: 'Processed 10,000 open-access paper sections.', category: 'milestone', criteriaKind: 'sectionsProcessed', criteriaValue: 10000 },
  { slug: '100-candidate-facts', name: '100 Candidate Facts', description: 'Contributed to 100 consensus-passed candidate facts.', category: 'milestone', criteriaKind: 'consensusPassedContributions', criteriaValue: 100 },
  { slug: '1000-candidate-facts', name: '1,000 Candidate Facts', description: 'Contributed to 1,000 consensus-passed candidate facts.', category: 'milestone', criteriaKind: 'consensusPassedContributions', criteriaValue: 1000 },
  { slug: 'reliable-contributor-7-days', name: 'Reliable Contributor: 7 Days', description: 'Contributed on 7 distinct days.', category: 'reliability', criteriaKind: 'distinctActiveDays', criteriaValue: 7 },
  { slug: 'reliable-contributor-30-days', name: 'Reliable Contributor: 30 Days', description: 'Contributed on 30 distinct days.', category: 'reliability', criteriaKind: 'distinctActiveDays', criteriaValue: 30 },
  { slug: 'low-error-contributor', name: 'Low Error Contributor', description: 'Reached 50 submissions with a low format-rejection rate.', category: 'reliability', criteriaKind: 'lowErrorSubmissions', criteriaValue: 50 },
  { slug: 'cancer-knowledge-miner-contributor', name: 'Cancer Knowledge Miner Contributor', description: 'Contributed to Cancer Knowledge Miner.', category: 'mission', criteriaKind: 'projectsContributedTo', criteriaValue: 1 },
  { slug: 'cancer-knowledge-miner-core-contributor', name: 'Cancer Knowledge Miner Core Contributor', description: 'Made sustained contributions to Cancer Knowledge Miner.', category: 'mission', criteriaKind: 'formatValidatedSubmissions', criteriaValue: 100 },
  { slug: 'team-player', name: 'Team Player', description: 'Joined an OpenCause team.', category: 'community', criteriaKind: 'teamMemberships', criteriaValue: 1 },
  { slug: 'team-captain', name: 'Team Captain', description: 'Created or captains an OpenCause team.', category: 'community', criteriaKind: 'teamCaptainMemberships', criteriaValue: 1 }
];
