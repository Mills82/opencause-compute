import { describe, expect, it } from 'vitest';
import { calculateContributionScore, BADGE_DEFINITIONS } from './gamification';

describe('calculateContributionScore', () => {
  it('rewards validated, consensus, review, and active-day contribution', () => {
    expect(calculateContributionScore({
      formatValidatedSubmissions: 10,
      consensusPassedContributions: 2,
      humanReviewedAcceptedContributions: 1,
      distinctActiveDays: 3,
      idleMinutesDonated: 120,
      formatRejectedSubmissions: 1,
      consensusFailedContributions: 1
    }).contributionScore).toBe(164);
  });

  it('caps raw idle time so it cannot dominate the score', () => {
    const score = calculateContributionScore({
      formatValidatedSubmissions: 1,
      consensusPassedContributions: 0,
      humanReviewedAcceptedContributions: 0,
      distinctActiveDays: 0,
      idleMinutesDonated: 10_000,
      formatRejectedSubmissions: 0,
      consensusFailedContributions: 0
    });
    expect(score.idleScoreRaw).toBe(166);
    expect(score.idleScore).toBeLessThan(score.idleScoreRaw);
    expect(score.contributionScore).toBe(47);
  });

  it('does not let rejected or failed submissions inflate score below zero', () => {
    expect(calculateContributionScore({
      formatValidatedSubmissions: 0,
      consensusPassedContributions: 0,
      humanReviewedAcceptedContributions: 0,
      distinctActiveDays: 0,
      idleMinutesDonated: 0,
      formatRejectedSubmissions: 10,
      consensusFailedContributions: 4
    }).contributionScore).toBe(0);
  });
});

describe('BADGE_DEFINITIONS', () => {
  it('contains unique badge slugs', () => {
    const slugs = BADGE_DEFINITIONS.map((badge) => badge.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
