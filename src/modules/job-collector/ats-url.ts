export type DiscoveredBoard = {
  sourceType: 'greenhouse' | 'lever' | 'ashby';
  boardToken: string;
  careersUrl: string;
};

const SKIP_TOKENS = new Set([
  'jobs',
  'job',
  'embed',
  'embeddable',
  'js',
  'css',
  'static',
  'assets',
  'www',
  'app',
  'api',
  'login',
  'signup',
]);

function isBoardToken(value: string | undefined): value is string {
  if (!value) return false;
  const token = value.toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,80}$/.test(token) && !SKIP_TOKENS.has(token);
}

export function parseAtsUrl(raw: string): DiscoveredBoard | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const token = parts[0];
    if (!isBoardToken(token)) return null;
    return {
      sourceType: 'greenhouse',
      boardToken: token.toLowerCase(),
      careersUrl: `https://boards.greenhouse.io/${token.toLowerCase()}`,
    };
  }

  if (host === 'boards-api.greenhouse.io' && parts[0] === 'v1' && parts[1] === 'boards' && isBoardToken(parts[2])) {
    const token = parts[2].toLowerCase();
    return {
      sourceType: 'greenhouse',
      boardToken: token,
      careersUrl: `https://boards.greenhouse.io/${token}`,
    };
  }

  if (host === 'jobs.lever.co' || host === 'api.lever.co') {
    const token = host === 'api.lever.co' && parts[0] === 'v0' && parts[1] === 'postings' ? parts[2] : parts[0];
    if (!isBoardToken(token)) return null;
    return {
      sourceType: 'lever',
      boardToken: token.toLowerCase(),
      careersUrl: `https://jobs.lever.co/${token.toLowerCase()}`,
    };
  }

  if (host === 'jobs.ashbyhq.com' || host === 'api.ashbyhq.com') {
    const token =
      host === 'api.ashbyhq.com' && parts[0] === 'posting-api' && parts[1] === 'job-board' ? parts[2] : parts[0];
    if (!isBoardToken(token)) return null;
    return {
      sourceType: 'ashby',
      boardToken: token.toLowerCase(),
      careersUrl: `https://jobs.ashbyhq.com/${token.toLowerCase()}`,
    };
  }

  return null;
}
