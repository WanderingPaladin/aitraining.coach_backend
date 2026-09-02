import { delay, SafeFetchError, safeFetchJson } from '../http.js';
import { sanitizeJobHtml } from '../html.js';
import { inferRemoteType, parseLocation, normalizeEmploymentType } from '../location.js';
import { asOptionalString, asString, firstNonEmpty, parseDate, stripHtml } from '../text.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../types.js';

type GreenhouseJob = {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  content?: string;
  location?: { name?: string };
  offices?: Array<{ name?: string; location?: string }>;
  metadata?: Array<{ name?: string; value?: unknown }>;
};

type GreenhousePayload = {
  jobs?: GreenhouseJob[];
};

function greenhouseUrl(token: string, page: number): string {
  const params = new URLSearchParams({ content: 'true' });
  if (page > 1) {
    params.set('page', String(page));
  }
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?${params.toString()}`;
}

export function normalizeGreenhouseJob(raw: GreenhouseJob, source: SourceConfig): NormalizedJob | null {
  const externalJobId = asString(raw.id);
  const title = asString(raw.title);
  const applyUrl = asOptionalString(raw.absolute_url);
  if (!externalJobId || !title || !applyUrl) {
    return null;
  }
  const html = sanitizeJobHtml(asString(raw.content));
  const locationName = firstNonEmpty(raw.location?.name, raw.offices?.[0]?.location, raw.offices?.[0]?.name);
  const parsed = parseLocation(locationName);
  return {
    externalJobId,
    title,
    companyName: source.companyName,
    companyLogoUrl: source.companyLogoUrl,
    descriptionHtml: html,
    descriptionText: stripHtml(html || asString(raw.content)),
    location: parsed.location,
    country: parsed.country,
    state: parsed.state,
    city: parsed.city,
    remoteType: parsed.remoteType ?? inferRemoteType(parsed.location, [title]),
    employmentType: normalizeEmploymentType(
      raw.metadata?.find((item) => /employ/i.test(asString(item.name)))?.value,
    ),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    experienceLevel: asOptionalString(
      raw.metadata?.find((item) => /experience/i.test(asString(item.name)))?.value,
    ),
    postedAt: parseDate(raw.updated_at),
    updatedAtSource: parseDate(raw.updated_at),
    expiresAt: null,
    applyUrl,
    sourceUrl: applyUrl,
  };
}

export class GreenhouseAdapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    const token = source.boardToken.trim();
    if (!token) {
      throw new SafeFetchError('BAD_SOURCE', 'Greenhouse sources require a board token');
    }
    const collected: RawJob[] = [];
    for (let page = 1; page <= 20; page += 1) {
      let payload: GreenhousePayload;
      try {
        payload = await safeFetchJson<GreenhousePayload>(greenhouseUrl(token, page));
      } catch (error) {
        if (error instanceof SafeFetchError && error.status === 404) {
          throw new SafeFetchError('BAD_SOURCE', 'Greenhouse board token was not found', 404);
        }
        throw error;
      }
      const jobs = payload.jobs ?? [];
      for (const job of jobs) {
        const id = asString(job.id);
        if (id) {
          collected.push({ externalId: id, payload: job });
        }
      }
      if (jobs.length < 100) {
        break;
      }
      await delay(250);
    }
    return collected;
  }

  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null {
    return normalizeGreenhouseJob((rawJob.payload ?? {}) as GreenhouseJob, source);
  }
}
