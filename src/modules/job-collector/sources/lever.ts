import { delay, SafeFetchError, safeFetchJson } from '../http.js';
import { sanitizeJobHtml } from '../html.js';
import { inferRemoteType, normalizeEmploymentType, parseLocation } from '../location.js';
import { asFiniteNumber, asOptionalString, asString, firstNonEmpty, parseDate, stripHtml } from '../text.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../types.js';

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  createdAt?: number;
  updatedAt?: number;
  workplaceType?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
  };
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  lists?: Array<{ text?: string; content?: string }>;
};

function leverUrl(site: string, skip: number): string {
  const params = new URLSearchParams({ mode: 'json', skip: String(skip), limit: '100' });
  return `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?${params.toString()}`;
}

function combineHtml(job: LeverPosting): string {
  const chunks = [job.description, job.additional, ...(job.lists ?? []).map((item) => item.content)];
  return chunks.filter(Boolean).join('\n');
}

export function normalizeLeverJob(raw: LeverPosting, source: SourceConfig): NormalizedJob | null {
  const externalJobId = asString(raw.id);
  const title = asString(raw.text);
  const applyUrl = firstNonEmpty(raw.applyUrl, raw.hostedUrl);
  if (!externalJobId || !title || !applyUrl) {
    return null;
  }
  const html = sanitizeJobHtml(combineHtml(raw));
  const parsed = parseLocation(raw.categories?.location, [raw.workplaceType]);
  return {
    externalJobId,
    title,
    companyName: source.companyName,
    companyLogoUrl: source.companyLogoUrl,
    descriptionHtml: html,
    descriptionText: firstNonEmpty(raw.descriptionPlain, raw.additionalPlain, stripHtml(html)) ?? '',
    location: parsed.location,
    country: parsed.country,
    state: parsed.state,
    city: parsed.city,
    remoteType: parsed.remoteType ?? inferRemoteType(parsed.location, [raw.workplaceType, title]),
    employmentType: normalizeEmploymentType(raw.categories?.commitment),
    salaryMin: asFiniteNumber(raw.salaryRange?.min),
    salaryMax: asFiniteNumber(raw.salaryRange?.max),
    salaryCurrency: asOptionalString(raw.salaryRange?.currency)?.toUpperCase() ?? null,
    experienceLevel: null,
    postedAt: parseDate(raw.createdAt),
    updatedAtSource: parseDate(raw.updatedAt) ?? parseDate(raw.createdAt),
    expiresAt: null,
    applyUrl,
    sourceUrl: firstNonEmpty(raw.hostedUrl, applyUrl) ?? applyUrl,
  };
}

export class LeverAdapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    const site = source.boardToken.trim();
    if (!site) {
      throw new SafeFetchError('BAD_SOURCE', 'Lever sources require a site identifier');
    }
    const collected: RawJob[] = [];
    for (let skip = 0; skip < 2000; skip += 100) {
      let payload: unknown;
      try {
        payload = await safeFetchJson<unknown>(leverUrl(site, skip));
      } catch (error) {
        if (error instanceof SafeFetchError && error.status === 404) {
          throw new SafeFetchError('BAD_SOURCE', 'Lever site identifier was not found', 404);
        }
        throw error;
      }
      const jobs = Array.isArray(payload) ? (payload as LeverPosting[]) : [];
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
    return normalizeLeverJob((rawJob.payload ?? {}) as LeverPosting, source);
  }
}
