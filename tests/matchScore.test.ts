import { describe, expect, it } from 'vitest';
import { canScoreMatch, matchLabel, profileReadiness, scoreOpportunity } from '../src/lib/matchScore.js';

const completeProfile = {
  firstName: 'Riley',
  profession: 'Finance',
  specialties: ['markets', 'research'],
  skills: ['finance', 'evaluation', 'writing'],
  yearsDomainExperience: 4,
  yearsOfAiTraining: 0,
  usEligibilityConfirmed: true,
  weeklyAvailability: '10-15 hours',
  platformsJoined: ['Handshake'],
  platformStatus: 'active',
  remotePreference: 'remote',
  desiredCategories: ['Finance', 'Evaluation'],
  city: 'Brooklyn',
  state: 'NY',
  applicantStage: 'new_no_account',
  languages: ['English'],
};

const financeRole = {
  category: 'Finance',
  skills: ['finance', 'research', 'evaluation'],
  experienceRequirement: '2+ years of domain experience',
  location: 'Remote',
  remoteStatus: 'remote',
  beginnerFriendly: false,
  eligibility: 'Typically oriented toward eligible U.S. participants.',
  sourcePlatform: 'Handshake',
};

describe('canScoreMatch', () => {
  it('requires profession, skills, specialties, or desired categories', () => {
    expect(
      canScoreMatch({
        specialties: [],
        skills: [],
        usEligibilityConfirmed: false,
        platformsJoined: [],
        desiredCategories: [],
      }),
    ).toBe(false);
    expect(canScoreMatch(completeProfile)).toBe(true);
  });
});

describe('scoreOpportunity', () => {
  it('returns null when the profile cannot be scored', () => {
    expect(
      scoreOpportunity(
        {
          specialties: [],
          skills: [],
          usEligibilityConfirmed: false,
          platformsJoined: [],
          desiredCategories: [],
        },
        financeRole,
      ),
    ).toBeNull();
  });

  it('scores a strong finance profile against a finance listing', () => {
    const match = scoreOpportunity(completeProfile, financeRole);
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(80);
    expect(match!.label).toBe(matchLabel(match!.score));
    expect(match!.reasons.some((reason) => reason.kind === 'match')).toBe(true);
  });

  it('renormalizes when an opportunity omits experience and skills', () => {
    const withFields = scoreOpportunity(completeProfile, financeRole)!;
    const sparse = scoreOpportunity(completeProfile, {
      category: 'Finance',
      skills: [],
      beginnerFriendly: true,
      sourcePlatform: 'Outlier',
    })!;
    expect(sparse.score).toBeGreaterThan(0);
    expect(sparse.score).not.toBe(withFields.score);
  });

  it('surfaces a hard mismatch for U.S. eligibility without hiding it in the score', () => {
    const match = scoreOpportunity(
      { ...completeProfile, usEligibilityConfirmed: false },
      financeRole,
    )!;
    expect(match.hardMismatches.length).toBeGreaterThan(0);
    expect(match.reasons[0]?.kind).toBe('hard');
  });
});

describe('matchLabel', () => {
  it('uses Fit labels instead of hiring-probability language', () => {
    expect(matchLabel(95)).toBe('Excellent Fit');
    expect(matchLabel(84)).toBe('Strong Fit');
    expect(matchLabel(72)).toBe('Good Fit');
    expect(matchLabel(61)).toBe('Possible Fit');
    expect(matchLabel(40)).toBe('Limited Fit');
  });
});

describe('profileReadiness', () => {
  it('is separate from job match and uses completeness components', () => {
    const ready = profileReadiness(completeProfile);
    expect(ready.score).toBeGreaterThan(50);
    expect(ready.completeEnough).toBe(true);
    expect(ready.components.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Profile completeness', 'Availability', 'Platform Readiness']),
    );
  });
});
