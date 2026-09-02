import { describe, expect, it } from 'vitest';
import { applyFingerprintDedupe, shouldMarkStale } from '../src/modules/job-collector/dedupe.js';
import { buildFingerprintKey, fingerprintJob, normalizeFingerprintPart } from '../src/modules/job-collector/fingerprint.js';
import { sanitizeJobHtml } from '../src/modules/job-collector/html.js';
import { assertPublicUrl, isPrivateIp } from '../src/modules/job-collector/http.js';
import { assignCategory, scoreRelevance } from '../src/modules/job-collector/relevance.js';
import { isPublicJob, type NormalizedJob } from '../src/modules/job-collector/types.js';

function job(overrides: Partial<NormalizedJob> & Pick<NormalizedJob, 'title'>): NormalizedJob {
  return {
    externalJobId: '1',
    companyName: 'Acme',
    companyLogoUrl: null,
    descriptionHtml: '',
    descriptionText: '',
    location: 'Remote',
    country: null,
    state: null,
    city: null,
    remoteType: 'remote',
    employmentType: 'contract',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    experienceLevel: null,
    postedAt: null,
    updatedAtSource: null,
    expiresAt: null,
    applyUrl: 'https://example.com/apply',
    sourceUrl: 'https://example.com/job',
    ...overrides,
  };
}

describe('relevance scoring', () => {
  it('publishes strong AI trainer titles automatically', () => {
    const score = scoreRelevance(job({ title: 'AI Trainer', descriptionText: 'Help with AI training and human feedback.' }));
    expect(score).toBeGreaterThanOrEqual(40);
    expect(assignCategory(job({ title: 'AI Trainer', descriptionText: '' }))).toBe('General AI Training');
  });

  it('does not publish generic software engineering jobs that merely mention AI', () => {
    const score = scoreRelevance(
      job({
        title: 'Software Engineer',
        descriptionText: 'Build AI features for our platform using Python.',
      }),
    );
    expect(score).toBeLessThan(20);
  });

  it('still qualifies coding expert AI training roles', () => {
    const score = scoreRelevance(
      job({
        title: 'Coding Expert – AI Training',
        descriptionText: 'Review model-generated code for an AI training program.',
      }),
    );
    expect(score).toBeGreaterThanOrEqual(40);
    expect(assignCategory(job({ title: 'Coding Expert – AI Training', descriptionText: 'programming' }))).toBe('Coding');
  });
});

describe('fingerprint generation', () => {
  it('normalizes case, punctuation, spacing, and remote wording', () => {
    expect(normalizeFingerprintPart('  AI  Trainer!!! ')).toBe('ai trainer');
    expect(buildFingerprintKey({ companyName: 'Acme, Inc.', title: 'AI Trainer', location: 'Work from home' })).toBe(
      'acme inc|ai trainer|remote',
    );
    expect(
      fingerprintJob({ companyName: 'Acme Inc', title: 'AI Trainer', location: 'Remote' }),
    ).toBe(
      fingerprintJob({ companyName: 'acme   inc.', title: 'ai trainer', location: 'WFH' }),
    );
  });
});

describe('deduplication', () => {
  it('keeps the ATS copy and marks the JSON-LD copy as a duplicate', () => {
    const decided = applyFingerprintDedupe([
      {
        id: 'jsonld-job',
        sourceId: 's2',
        sourceType: 'jsonld',
        sourcePriority: 10,
        fingerprint: 'abc',
        isActive: true,
        isDuplicate: false,
      },
      {
        id: 'gh-job',
        sourceId: 's1',
        sourceType: 'greenhouse',
        sourcePriority: 50,
        fingerprint: 'abc',
        isActive: true,
        isDuplicate: false,
      },
    ]);
    const greenhouse = decided.find((item) => item.id === 'gh-job');
    const jsonld = decided.find((item) => item.id === 'jsonld-job');
    expect(greenhouse?.isDuplicate).toBe(false);
    expect(jsonld?.isDuplicate).toBe(true);
  });
});

describe('stale-job logic', () => {
  it('marks a job inactive after 24 hours unseen following a successful sync', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    expect(
      shouldMarkStale({
        isActive: true,
        lastSeenAt: new Date('2026-08-31T11:00:00.000Z'),
        sourceLastSuccessAt: new Date('2026-09-02T10:00:00.000Z'),
        now,
      }),
    ).toBe(true);
  });

  it('does not stale a job that was seen in the latest successful sync', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    expect(
      shouldMarkStale({
        isActive: true,
        lastSeenAt: new Date('2026-09-02T10:00:00.000Z'),
        sourceLastSuccessAt: new Date('2026-09-02T10:00:00.000Z'),
        now,
      }),
    ).toBe(false);
  });
});

describe('public visibility', () => {
  it('hides inactive, duplicate, and low-score jobs', () => {
    expect(isPublicJob({ isActive: true, isDuplicate: false, relevanceScore: 50 })).toBe(true);
    expect(isPublicJob({ isActive: false, isDuplicate: false, relevanceScore: 90 })).toBe(false);
    expect(isPublicJob({ isActive: true, isDuplicate: true, relevanceScore: 90 })).toBe(false);
    expect(isPublicJob({ isActive: true, isDuplicate: false, relevanceScore: 39 })).toBe(false);
  });
});

describe('security helpers', () => {
  it('blocks private and metadata addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.8')).toBe(true);
    expect(isPrivateIp('192.168.1.9')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(() => assertPublicUrl('http://localhost/jobs')).toThrow();
    expect(() => assertPublicUrl('http://127.0.0.1/jobs')).toThrow();
    expect(() => assertPublicUrl('https://example.com/jobs')).not.toThrow();
  });

  it('strips scripts from crawled HTML', () => {
    const html = sanitizeJobHtml('<p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://ok.example/a">ok</a>');
    expect(html).toContain('<p>Safe</p>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('https://ok.example/a');
  });
});
