import { safeFetch, SafeFetchError } from './http.js';
import { JOB_BOT_USER_AGENT } from './types.js';

type RobotsRule = {
  userAgent: string;
  allows: string[];
  disallows: string[];
};

function longestMatch(path: string, prefixes: string[]): number {
  let best = -1;
  for (const prefix of prefixes) {
    if (!prefix) {
      continue;
    }
    if (path.startsWith(prefix) && prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}

export function parseRobotsTxt(body: string): RobotsRule[] {
  const groups: RobotsRule[] = [];
  let current: RobotsRule | null = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      continue;
    }
    const index = line.indexOf(':');
    if (index < 1) {
      continue;
    }
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key === 'user-agent') {
      current = { userAgent: value.toLowerCase(), allows: [], disallows: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (key === 'allow') {
      current.allows.push(value);
    } else if (key === 'disallow') {
      current.disallows.push(value);
    }
  }
  return groups;
}

export function isPathAllowed(pathname: string, robots: RobotsRule[], userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const matching = robots.filter(
    (group) => group.userAgent === '*' || ua.includes(group.userAgent) || group.userAgent.includes('aitrainerscoachjobbot'),
  );
  if (matching.length === 0) {
    return true;
  }
  let allowLen = -1;
  let disallowLen = -1;
  for (const group of matching) {
    allowLen = Math.max(allowLen, longestMatch(pathname, group.allows));
    disallowLen = Math.max(disallowLen, longestMatch(pathname, group.disallows));
    if (group.disallows.includes('/') && group.allows.length === 0) {
      disallowLen = Math.max(disallowLen, 1);
    }
  }
  if (disallowLen < 0) {
    return true;
  }
  return allowLen >= disallowLen;
}

export async function assertRobotsAllowed(targetUrl: string, userAgent = JOB_BOT_USER_AGENT): Promise<void> {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.origin}/robots.txt`;
  let body = '';
  try {
    const result = await safeFetch(robotsUrl, { timeoutMs: 8_000, accept: 'text/plain' });
    body = result.text;
  } catch (error) {
    if (error instanceof SafeFetchError && (error.status === 404 || error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR')) {
      return;
    }
    throw error;
  }
  const allowed = isPathAllowed(url.pathname, parseRobotsTxt(body), userAgent);
  if (!allowed) {
    throw new SafeFetchError('ROBOTS_DISALLOWED', `robots.txt disallows crawling ${url.pathname}`);
  }
}
