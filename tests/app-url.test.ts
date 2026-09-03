import { describe, expect, it } from 'vitest';
import { buildAppUrl, getAppUrl } from '../src/lib/app-url.js';

describe('app url', () => {
  it('falls back to localhost when unset', () => {
    expect(getAppUrl({})).toBe('http://localhost:3000');
  });

  it('prefers APP_URL over APP_ORIGIN', () => {
    expect(
      getAppUrl({
        APP_URL: 'https://aitrainers.coach/',
        APP_ORIGIN: 'http://localhost:3000',
      }),
    ).toBe('https://aitrainers.coach');
  });

  it('uses APP_ORIGIN when APP_URL is missing', () => {
    expect(getAppUrl({ APP_ORIGIN: 'https://aitraininersdev.netlify.app' })).toBe(
      'https://aitraininersdev.netlify.app',
    );
  });

  it('builds verification and reset links with encoded tokens', () => {
    const env = { APP_URL: 'https://aitrainers.coach' };
    const token = 'abc+/=';
    expect(buildAppUrl(`/verify-email?token=${encodeURIComponent(token)}`, env)).toBe(
      'https://aitrainers.coach/verify-email?token=abc%2B%2F%3D',
    );
    expect(buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`, env)).toBe(
      'https://aitrainers.coach/reset-password?token=abc%2B%2F%3D',
    );
  });
});
