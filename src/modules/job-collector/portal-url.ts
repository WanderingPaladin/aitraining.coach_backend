const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MERCOR_LISTING_RE = /^list_[A-Za-z0-9_-]+$/;

export function parseMicro1PostId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'jobs.micro1.ai') {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'post' || !parts[1] || !UUID_RE.test(parts[1])) {
    return null;
  }
  return parts[1].toLowerCase();
}

export function parseMercorListingId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'work.mercor.com') {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'jobs' || !parts[1] || !MERCOR_LISTING_RE.test(parts[1])) {
    return null;
  }
  return parts[1];
}

export function parseSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const value = (match[1] ?? '').trim();
    if (value) {
      locs.push(value);
    }
  }
  return locs;
}

export function extractMicro1JobStatus(html: string): string | null {
  const escaped = /job_status\\":\\"([^\\"]+)/i.exec(html);
  if (escaped?.[1]) {
    return escaped[1].toLowerCase();
  }
  const plain = /"job_status"\s*:\s*"([^"]+)"/i.exec(html);
  return plain?.[1]?.toLowerCase() ?? null;
}

const CLOSED_STATUSES = new Set([
  'closed',
  'archived',
  'inactive',
  'filled',
  'deleted',
  'cancelled',
  'canceled',
  'expired',
  'draft',
]);

export function isClosedMarketplaceStatus(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }
  return CLOSED_STATUSES.has(status.trim().toLowerCase());
}
