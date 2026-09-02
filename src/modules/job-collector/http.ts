import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { JOB_BOT_USER_AGENT } from './types.js';

export class SafeFetchError extends Error {
  readonly status?: number;
  readonly code: string;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'SafeFetchError';
    this.code = code;
    this.status = status;
  }
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/');
  if (!range || !bitsRaw) {
    return false;
  }
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return (
      inCidr(ip, '0.0.0.0/8') ||
      inCidr(ip, '10.0.0.0/8') ||
      inCidr(ip, '127.0.0.0/8') ||
      inCidr(ip, '169.254.0.0/16') ||
      inCidr(ip, '172.16.0.0/12') ||
      inCidr(ip, '192.168.0.0/16') ||
      inCidr(ip, '224.0.0.0/4') ||
      inCidr(ip, '255.255.255.255/32')
    );
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') {
      return true;
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      return isPrivateIp(mapped);
    }
  }
  return false;
}

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('INVALID_URL', 'Source URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('INVALID_URL', 'Only http and https URLs are allowed');
  }
  if (url.username || url.password) {
    throw new SafeFetchError('INVALID_URL', 'URLs with credentials are not allowed');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new SafeFetchError('SSRF_BLOCKED', 'Refusing to fetch a private or internal host');
  }
  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new SafeFetchError('SSRF_BLOCKED', 'Refusing to fetch a private IP address');
  }
  return url;
}

export async function assertResolvedPublic(url: URL): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SafeFetchError('SSRF_BLOCKED', 'Refusing to fetch a private IP address');
    }
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError('DNS_ERROR', `Could not resolve ${hostname}`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new SafeFetchError('SSRF_BLOCKED', 'Refusing to fetch a host that resolves to a private address');
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  accept?: string;
  method?: 'GET' | 'HEAD';
};

export type SafeFetchResult = {
  url: string;
  status: number;
  headers: Headers;
  text: string;
};

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new SafeFetchError('BODY_TOO_LARGE', 'Response exceeded the size limit');
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const userAgent = options.userAgent ?? JOB_BOT_USER_AGENT;
  let current = assertPublicUrl(rawUrl);
  await assertResolvedPublic(current);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: options.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': userAgent,
          accept: options.accept ?? 'application/json, text/html;q=0.9, */*;q=0.8',
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SafeFetchError('TIMEOUT', 'Request timed out');
      }
      throw new SafeFetchError('NETWORK_ERROR', error instanceof Error ? error.message : 'Network error');
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new SafeFetchError('REDIRECT_ERROR', 'Redirect missing Location header', response.status);
      }
      current = assertPublicUrl(new URL(location, current).toString());
      await assertResolvedPublic(current);
      continue;
    }

    if (response.status === 429) {
      throw new SafeFetchError('RATE_LIMITED', 'Upstream rate limited the request', 429);
    }
    if (response.status >= 400) {
      throw new SafeFetchError('HTTP_ERROR', `Upstream responded with ${response.status}`, response.status);
    }

    const text = options.method === 'HEAD' ? '' : await readLimited(response, maxBytes);
    return { url: current.toString(), status: response.status, headers: response.headers, text };
  }

  throw new SafeFetchError('REDIRECT_ERROR', 'Too many redirects');
}

export async function safeFetchJson<T>(url: string, options?: SafeFetchOptions): Promise<T> {
  const result = await safeFetch(url, {
    ...options,
    accept: 'application/json',
  });
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new SafeFetchError('PARSE_ERROR', 'Upstream returned invalid JSON');
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
