import { SafeFetchError, safeFetch } from '../http.js';
import { sanitizeJobHtml } from '../html.js';
import { inferRemoteType, normalizeEmploymentType, parseLocation } from '../location.js';
import { assertRobotsAllowed } from '../robots.js';
import { asFiniteNumber, asOptionalString, asString, firstNonEmpty, parseDate, stripHtml } from '../text.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../types.js';

type JsonLdNode = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

function typeList(node: JsonLdNode): string[] {
  return asArray(node['@type']).map((item) => asString(item).toLowerCase());
}

function isJobPosting(node: unknown): node is JsonLdNode {
  return Boolean(node && typeof node === 'object' && typeList(node as JsonLdNode).includes('jobposting'));
}

function collectNodes(value: unknown, into: JsonLdNode[]): void {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNodes(item, into);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const node = value as JsonLdNode;
  into.push(node);
  if (node['@graph']) {
    collectNodes(node['@graph'], into);
  }
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const raw = (match[1] ?? '').trim();
    if (!raw) {
      continue;
    }
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      try {
        blocks.push(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')));
      } catch {
        // Malformed JSON-LD must not abort the rest of the page.
      }
    }
  }
  return blocks;
}

export function decodeNextFlightPushPayload(rawJsString: string): string | null {
  try {
    return JSON.parse(`"${rawJsString.replace(/\r?\n/g, '\\n')}"`) as string;
  } catch {
    return null;
  }
}

export function extractNextFlightPayloads(html: string): string[] {
  const payloads: string[] = [];
  const pattern = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const decoded = decodeNextFlightPushPayload(match[1] ?? '');
    if (decoded) {
      payloads.push(decoded);
    }
  }
  return payloads;
}

function parseJsonish(text: string): unknown {
  const start = text.search(/[\[{]/);
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function collectJobPostings(value: unknown, into: JsonLdNode[]): void {
  const nodes: JsonLdNode[] = [];
  collectNodes(value, nodes);
  for (const node of nodes) {
    if (isJobPosting(node)) {
      into.push(node);
    }
  }
}

export function extractJobPostings(html: string): JsonLdNode[] {
  const postings: JsonLdNode[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    collectJobPostings(block, postings);
  }
  for (const payload of extractNextFlightPayloads(html)) {
    collectJobPostings(parseJsonish(payload), postings);
  }
  return postings;
}

function organizationName(node: unknown, fallback: string): string {
  if (!node || typeof node !== 'object') {
    return fallback;
  }
  const org = node as JsonLdNode;
  return firstNonEmpty(org.name, fallback) ?? fallback;
}

function organizationLogo(node: unknown, fallback: string | null): string | null {
  if (!node || typeof node !== 'object') {
    return fallback;
  }
  const org = node as JsonLdNode;
  if (typeof org.logo === 'string') {
    return asOptionalString(org.logo);
  }
  if (org.logo && typeof org.logo === 'object' && 'url' in org.logo) {
    return asOptionalString((org.logo as JsonLdNode).url);
  }
  return fallback;
}

function locationFromJsonLd(node: JsonLdNode): ReturnType<typeof parseLocation> {
  const locations = asArray(node.jobLocation);
  const first = locations[0];
  if (!first || typeof first !== 'object') {
    return parseLocation(asOptionalString(node.jobLocationType), [asOptionalString(node.jobLocationType)]);
  }
  const place = first as JsonLdNode;
  const address = place.address && typeof place.address === 'object' ? (place.address as JsonLdNode) : {};
  const raw = firstNonEmpty(
    address.addressLocality && address.addressRegion
      ? `${asString(address.addressLocality)}, ${asString(address.addressRegion)}`
      : null,
    address.addressLocality,
    place.name,
    asOptionalString(node.jobLocationType),
  );
  return parseLocation(raw, [asOptionalString(node.jobLocationType)]);
}

function salaryFromJsonLd(node: JsonLdNode): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const salary = node.baseSalary;
  if (!salary || typeof salary !== 'object') {
    return { min: null, max: null, currency: null };
  }
  const amount = salary as JsonLdNode;
  const value = amount.value && typeof amount.value === 'object' ? (amount.value as JsonLdNode) : amount;
  return {
    min: asFiniteNumber(value.minValue ?? value.value),
    max: asFiniteNumber(value.maxValue ?? value.value),
    currency: asOptionalString(amount.currency)?.toUpperCase() ?? null,
  };
}

export function normalizeJsonLdJob(raw: JsonLdNode, source: SourceConfig, pageUrl: string): NormalizedJob | null {
  const title = asString(raw.title);
  const applyUrl = firstNonEmpty(raw.url, raw.applicationUrl, pageUrl);
  if (!title || !applyUrl) {
    return null;
  }
  const html = sanitizeJobHtml(asString(raw.description));
  const parsed = locationFromJsonLd(raw);
  const pay = salaryFromJsonLd(raw);
  const org = raw.hiringOrganization;
  const externalJobId =
    asOptionalString(raw.identifier) ??
    (typeof raw.identifier === 'object' && raw.identifier
      ? asOptionalString((raw.identifier as JsonLdNode).value)
      : null) ??
    `${title}:${applyUrl}`.slice(0, 180);
  return {
    externalJobId,
    title,
    companyName: organizationName(org, source.companyName),
    companyLogoUrl: organizationLogo(org, source.companyLogoUrl),
    descriptionHtml: html,
    descriptionText: stripHtml(html || asString(raw.description)),
    location: parsed.location,
    country: parsed.country,
    state: parsed.state,
    city: parsed.city,
    remoteType:
      asString(raw.jobLocationType).toUpperCase() === 'TELECOMMUTE'
        ? 'remote'
        : parsed.remoteType ?? inferRemoteType(parsed.location, [title]),
    employmentType: normalizeEmploymentType(
      Array.isArray(raw.employmentType) ? raw.employmentType[0] : raw.employmentType,
    ),
    salaryMin: pay.min,
    salaryMax: pay.max,
    salaryCurrency: pay.currency,
    experienceLevel: asOptionalString(raw.experienceRequirements),
    postedAt: parseDate(raw.datePosted),
    updatedAtSource: parseDate(raw.datePosted),
    expiresAt: parseDate(raw.validThrough),
    applyUrl,
    sourceUrl: applyUrl,
  };
}

export class JsonLdAdapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    const pageUrl = source.careersUrl.trim();
    if (!pageUrl) {
      throw new SafeFetchError('BAD_SOURCE', 'JSON-LD sources require a careers URL');
    }
    await assertRobotsAllowed(pageUrl);
    const result = await safeFetch(pageUrl, { accept: 'text/html', timeoutMs: 20_000 });
    return extractJobPostings(result.text).map((payload, index) => ({
      externalId: asString((payload as JsonLdNode).identifier) || `jsonld-${index + 1}`,
      payload,
    }));
  }

  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null {
    return normalizeJsonLdJob((rawJob.payload ?? {}) as JsonLdNode, source, source.careersUrl);
  }
}
