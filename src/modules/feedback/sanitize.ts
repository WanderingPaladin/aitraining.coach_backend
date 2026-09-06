const MAX_MESSAGE = 500;
const MAX_UA = 300;

export function sanitizeFeedbackText(value: string, max = MAX_MESSAGE): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function parseBrowserName(userAgent: string): string {
  const ua = userAgent.slice(0, 400);
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  return 'Other';
}

export function inferDeviceType(userAgent: string, fallback: string | null): string | null {
  if (fallback === 'desktop' || fallback === 'tablet' || fallback === 'mobile') {
    return fallback;
  }
  if (/Mobi|Android.+Mobile|iPhone|iPod/i.test(userAgent)) return 'mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(userAgent)) return 'tablet';
  return userAgent ? 'desktop' : null;
}

export function sanitizePagePath(value: string): string {
  const raw = value.trim() || '/';
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).pathname.slice(0, 200) || '/';
    }
  } catch {
    // fall through
  }
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return path.replace(/[^\w\-./]/g, '').slice(0, 200) || '/';
}

export function sanitizeHttpUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 500);
  } catch {
    return '';
  }
}

export { MAX_MESSAGE, MAX_UA };
