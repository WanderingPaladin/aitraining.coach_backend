const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BLOCKED_META_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'ip',
  'ipAddress',
  'phone',
  'email',
]);

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export function sanitizePagePath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://aitrainers.coach');
    const path = url.pathname || '/';
    return path.slice(0, 300);
  } catch {
    return raw.startsWith('/') ? raw.slice(0, 300) : `/${raw.slice(0, 299)}`;
  }
}

export function sanitizePlatform(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 80);
}

export function sanitizeMetadata(
  value: unknown,
): Record<string, string | number | boolean | null> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (BLOCKED_META_KEYS.has(key) || key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
      continue;
    }
    if (result && Object.keys(result).length >= 20) {
      break;
    }
    if (typeof entry === 'string') {
      result[key] = entry.slice(0, 200);
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      result[key] = entry;
    } else if (typeof entry === 'boolean' || entry === null) {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function inferDeviceType(userAgent: string | null | undefined): 'desktop' | 'tablet' | 'mobile' | null {
  if (!userAgent) {
    return null;
  }
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) {
    return 'tablet';
  }
  if (/mobi|iphone|android/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function parseBrowserName(userAgent: string | null | undefined): string | null {
  if (!userAgent) {
    return null;
  }
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent)) return 'Chrome';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  return 'Other';
}
