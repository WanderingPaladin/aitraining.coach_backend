import { describe, expect, it } from 'vitest';
import { createFeedbackBody } from '../src/modules/feedback/schema.js';
import { feedbackMessageIssue, isLowQualityFeedback } from '../src/modules/feedback/quality.js';
import {
  inferDeviceType,
  parseBrowserName,
  sanitizeFeedbackText,
  sanitizeHttpUrl,
  sanitizePagePath,
} from '../src/modules/feedback/sanitize.js';

describe('createFeedbackBody', () => {
  it('accepts structured feedback', () => {
    const parsed = createFeedbackBody.parse({
      category: 'confusing',
      subcategory: 'profile_match',
      message: 'I do not understand why my score is 72.',
      rating: null,
      pagePath: '/profile',
      pageUrl: 'https://aitrainers.coach/profile',
      email: null,
      metadata: {
        browser: 'Chrome',
        deviceType: 'desktop',
        screenWidth: 1440,
        screenHeight: 900,
        referrer: 'https://aitrainers.coach/',
      },
    });
    expect(parsed.category).toBe('confusing');
    expect(parsed.subcategory).toBe('profile_match');
    expect(parsed.email).toBeNull();
  });

  it('rejects repeated-character messages', () => {
    expect(() =>
      createFeedbackBody.parse({
        category: 'general',
        message: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        pagePath: '/',
      }),
    ).toThrow();
  });

  it('accepts a real comment about Profile Match', () => {
    const parsed = createFeedbackBody.parse({
      category: 'confusing',
      message: "I don't understand what the Profile Match score means.",
      pagePath: '/profile',
    });
    expect(parsed.message).toContain('Profile Match');
  });

  it('accepts rating-only feedback', () => {
    const parsed = createFeedbackBody.parse({
      category: 'general',
      rating: 3,
      pagePath: '/',
    });
    expect(parsed.rating).toBe(3);
    expect(parsed.message).toBe('');
  });

  it('rejects empty feedback', () => {
    expect(() =>
      createFeedbackBody.parse({
        category: 'general',
        message: '   ',
      }),
    ).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() =>
      createFeedbackBody.parse({
        category: 'question',
        message: 'How does coaching work?',
        email: 'not-an-email',
      }),
    ).toThrow();
  });

  it('rejects oversized ratings', () => {
    expect(() =>
      createFeedbackBody.parse({
        category: 'general',
        rating: 9,
        message: 'Great',
      }),
    ).toThrow();
  });
});

describe('feedback sanitization', () => {
  it('strips html and caps length', () => {
    expect(sanitizeFeedbackText('<script>alert(1)</script>hello')).toBe('alert(1) hello');
    expect(sanitizeFeedbackText('a'.repeat(600)).length).toBe(500);
  });

  it('keeps pathname only', () => {
    expect(sanitizePagePath('https://aitrainers.coach/profile?x=1')).toBe('/profile');
    expect(sanitizePagePath('opportunities')).toBe('/opportunities');
  });

  it('drops non-http urls', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeHttpUrl('https://aitrainers.coach/profile')).toBe('https://aitrainers.coach/profile');
  });

  it('parses browser and device from user agent', () => {
    expect(parseBrowserName('Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome');
    expect(inferDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', null)).toBe('mobile');
    expect(inferDeviceType('Mozilla/5.0', 'tablet')).toBe('tablet');
  });
});

describe('feedback quality', () => {
  it('flags repeated characters and punctuation-only text', () => {
    expect(isLowQualityFeedback('xxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isLowQualityFeedback('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')).toBe(true);
    expect(isLowQualityFeedback('123123123123123123')).toBe(true);
  });

  it('allows ordinary comments', () => {
    expect(isLowQualityFeedback("I don't understand what the Profile Match score means.")).toBe(false);
    expect(feedbackMessageIssue('Great', true)).toBeNull();
    expect(feedbackMessageIssue('Great', false)).toBe('short');
  });
});
