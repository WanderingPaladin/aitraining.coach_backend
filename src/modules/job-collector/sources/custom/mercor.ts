import { markdownToJobHtml } from '../../html.js';
import { SafeFetchError, safeFetch } from '../../http.js';
import { inferRemoteType, normalizeEmploymentType, parseLocation } from '../../location.js';
import { isClosedMarketplaceStatus, parseMercorListingId } from '../../portal-url.js';
import { assertRobotsAllowed } from '../../robots.js';
import { asFiniteNumber, asOptionalString, asString, parseDate, slugify, stripHtml } from '../../text.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../../types.js';

const EXPLORE_URL = 'https://work.mercor.com/explore';

export type MercorListing = {
  listingId?: string;
  title?: string;
  description?: string;
  status?: string;
  commitment?: string;
  location?: string;
  workArrangement?: string;
  rateMin?: number | null;
  rateMax?: number | null;
  hourlyPayRate?: number | null;
  postedAt?: string | null;
  createdAt?: string | null;
  deletedAt?: string | null;
  isPrivate?: boolean;
  disableApplications?: boolean;
  companyName?: string | null;
};

function walkForListings(value: unknown, into: MercorListing[]): void {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      value.every((item) => item && typeof item === 'object' && 'listingId' in item && 'title' in item)
    ) {
      into.push(...(value as MercorListing[]));
      return;
    }
    for (const item of value) {
      walkForListings(item, into);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.listings)) {
    walkForListings(record.listings, into);
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      walkForListings(nested, into);
    }
  }
}

export function extractMercorListings(html: string): MercorListing[] {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match?.[1]) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const found: MercorListing[] = [];
  walkForListings(data, found);
  const unique = new Map<string, MercorListing>();
  for (const listing of found) {
    const id = asOptionalString(listing.listingId);
    if (id && !unique.has(id)) {
      unique.set(id, listing);
    }
  }
  return [...unique.values()];
}

export function isOpenMercorListing(listing: MercorListing): boolean {
  if (listing.isPrivate || listing.disableApplications || listing.deletedAt) {
    return false;
  }
  if (isClosedMarketplaceStatus(asOptionalString(listing.status))) {
    return false;
  }
  const title = asString(listing.title);
  if (!title || /talent network/i.test(title)) {
    return false;
  }
  const status = asOptionalString(listing.status)?.toLowerCase();
  return !status || status === 'active' || status === 'open' || status === 'published';
}

export function mercorJobUrl(listingId: string, title: string): string {
  const slug = slugify(title, 80);
  return `https://work.mercor.com/jobs/${listingId}/${slug}`;
}

function mapCommitment(value: unknown): string | null {
  const text = asOptionalString(value)?.toLowerCase();
  if (!text) {
    return null;
  }
  if (text === 'hourly' || text === 'task-based' || text === 'task based') {
    return 'contract';
  }
  return normalizeEmploymentType(text);
}

export function normalizeMercorListing(listing: MercorListing, source: SourceConfig): NormalizedJob | null {
  const listingId = asOptionalString(listing.listingId);
  const title = asString(listing.title);
  if (!listingId || !title || !isOpenMercorListing(listing)) {
    return null;
  }
  const applyUrl = mercorJobUrl(listingId, title);
  const description = typeof listing.description === 'string' ? listing.description : asString(listing.description);
  const html = markdownToJobHtml(description);
  const parsed = parseLocation(listing.location, [listing.workArrangement, title]);
  const rateMin = asFiniteNumber(listing.rateMin ?? listing.hourlyPayRate);
  const rateMax = asFiniteNumber(listing.rateMax ?? listing.rateMin ?? listing.hourlyPayRate);
  return {
    externalJobId: listingId,
    title,
    companyName: source.companyName || 'Mercor',
    companyLogoUrl: source.companyLogoUrl,
    descriptionHtml: html,
    descriptionText: stripHtml(html) || asString(listing.description),
    location: parsed.location ?? 'Remote',
    country: parsed.country,
    state: parsed.state,
    city: parsed.city,
    remoteType: parsed.remoteType ?? inferRemoteType(listing.location ?? 'Remote', [listing.workArrangement, title]),
    employmentType: mapCommitment(listing.commitment) ?? 'contract',
    salaryMin: rateMin,
    salaryMax: rateMax,
    salaryCurrency: rateMin != null || rateMax != null ? 'USD' : null,
    experienceLevel: null,
    postedAt: parseDate(listing.postedAt ?? listing.createdAt),
    updatedAtSource: parseDate(listing.postedAt ?? listing.createdAt),
    expiresAt: null,
    applyUrl,
    sourceUrl: applyUrl,
  };
}

export class MercorAdapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    const pageUrl = source.careersUrl.trim() || EXPLORE_URL;
    if (parseMercorListingId(pageUrl)) {
      throw new SafeFetchError(
        'BAD_SOURCE',
        'Mercor sources should point at the public /explore catalog, not a single job',
      );
    }
    await assertRobotsAllowed(pageUrl);
    const page = await safeFetch(pageUrl, {
      accept: 'text/html',
      timeoutMs: 25_000,
      maxBytes: 6_000_000,
    });
    return extractMercorListings(page.text)
      .filter(isOpenMercorListing)
      .map((listing) => ({
        externalId: asString(listing.listingId),
        payload: listing,
      }))
      .filter((job) => job.externalId);
  }

  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null {
    return normalizeMercorListing((rawJob.payload ?? {}) as MercorListing, source);
  }
}
