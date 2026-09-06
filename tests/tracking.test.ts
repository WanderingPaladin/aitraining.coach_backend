import { describe, expect, it } from 'vitest';
import { classifySource, normalizeAttribution, sourceLabel } from '../src/modules/tracking/attribution.js';
import { higherStage } from '../src/modules/tracking/types.js';
import { isUuid, sanitizeMetadata, sanitizePagePath } from '../src/modules/tracking/sanitize.js';
import { PUBLIC_EVENT_TYPES } from '../src/modules/tracking/types.js';
import { trackEventsBody, trackSessionBody, upsertPlatformProgressBody } from '../src/modules/tracking/schema.js';

describe('attribution', () => {
  it('keeps reddit utm as first source', () => {
    expect(
      classifySource({
        utmSource: 'reddit',
        utmMedium: 'community',
        utmCampaign: 'test-funnel',
        referrer: 'https://google.com/',
      }),
    ).toBe('reddit');
  });

  it('classifies google referrer without utm', () => {
    expect(classifySource({ referrer: 'https://www.google.com/search?q=ai+trainers' })).toBe('google');
  });

  it('uses direct when there is no referrer or utm', () => {
    expect(classifySource({})).toBe('direct');
  });

  it('does not treat first-party hosts as a marketing source', () => {
    expect(classifySource({ referrer: 'https://aitrainers.coach/opportunities' })).toBe('direct');
  });

  it('labels unknown sources explicitly', () => {
    expect(sourceLabel(null)).toBe('Unknown');
    expect(sourceLabel('reddit')).toBe('Reddit');
  });

  it('preserves landing and campaign fields', () => {
    const result = normalizeAttribution({
      landingPage: '/?utm_source=reddit&utm_medium=community&utm_campaign=test-funnel',
      utmSource: 'reddit',
      utmMedium: 'community',
      utmCampaign: 'test-funnel',
    });
    expect(result.firstSource).toBe('reddit');
    expect(result.utmCampaign).toBe('test-funnel');
  });
});

describe('tracking sanitization', () => {
  it('accepts uuids and rejects other ids', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('keeps pathname only', () => {
    expect(sanitizePagePath('https://aitrainersdev.netlify.app/opportunities?x=1')).toBe('/opportunities');
  });

  it('strips secrets from metadata', () => {
    const sanitized = sanitizeMetadata({
      stage: 'new_no_account',
      password: 'secret',
      token: 'abc',
      ipAddress: '1.2.3.4',
    });
    expect(sanitized).toEqual({ stage: 'new_no_account' });
  });
});

describe('journey stages', () => {
  it('only advances forward', () => {
    expect(higherStage('application_submitted', 'intro_call_booked')).toBe('intro_call_booked');
    expect(higherStage('project_started', 'application_submitted')).toBe('project_started');
    expect(higherStage('intro_call_booked', 'inactive')).toBe('intro_call_booked');
  });
});

describe('tracking schemas', () => {
  it('accepts a public session payload', () => {
    const parsed = trackSessionBody.parse({
      visitorId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      utmSource: 'reddit',
      landingPage: '/',
    });
    expect(parsed.utmSource).toBe('reddit');
  });

  it('rejects server-only events from the public API', () => {
    expect(() =>
      trackEventsBody.parse({
        visitorId: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
        events: [{ eventType: 'platform_interview_passed' }],
      }),
    ).toThrow();
  });

  it('allows the public event whitelist', () => {
    expect(PUBLIC_EVENT_TYPES).toContain('application_started');
    expect(PUBLIC_EVENT_TYPES).not.toContain('booking_confirmed');
  });

  it('requires a platform name for admin progress updates', () => {
    const parsed = upsertPlatformProgressBody.parse({
      platform: 'Outlier',
      status: 'interview_scheduled',
    });
    expect(parsed.status).toBe('interview_scheduled');
  });
});
