import { describe, expect, it } from 'vitest';
import {
  extractJobSkills,
  inferJobCategory,
  isBeginnerFriendlyJob,
  jobToMatchOpportunity,
} from '../src/lib/jobMatch.js';

describe('jobMatch helpers', () => {
  it('extracts skills from job title and description', () => {
    expect(
      extractJobSkills(
        'Finance AI Evaluator',
        'Evaluate model outputs and write detailed feedback on finance topics.',
        'Finance',
      ),
    ).toEqual(expect.arrayContaining(['evaluate', 'finance']));
  });

  it('infers category from job text when missing', () => {
    expect(inferJobCategory('Legal Expert Evaluator', 'Review legal model responses', null)).toBe('Legal');
  });

  it('detects beginner-friendly roles', () => {
    expect(isBeginnerFriendlyJob('Entry Level', 'No prior experience required')).toBe(true);
    expect(isBeginnerFriendlyJob('Senior', '5+ years required')).toBe(false);
  });

  it('maps a public job into a match opportunity', () => {
    const matchInput = jobToMatchOpportunity({
      title: 'Research Evaluator',
      descriptionText: 'Evaluate AI research outputs. Remote role for U.S. contributors.',
      category: 'Research',
      experienceLevel: 'Mid Level',
      location: 'Remote',
      remoteType: 'remote',
      companyName: 'micro1',
    });

    expect(matchInput.category).toBe('Research');
    expect(matchInput.skills).toEqual(expect.arrayContaining(['evaluate', 'research']));
    expect(matchInput.remoteStatus).toBe('remote');
    expect(matchInput.sourcePlatform).toBe('micro1');
  });
});
