import { SafeFetchError, safeFetchJson } from '../http.js';
import { sanitizeJobHtml } from '../html.js';
import { inferRemoteType, normalizeEmploymentType, parseLocation } from '../location.js';
import { asFiniteNumber, asOptionalString, asString, firstNonEmpty, parseDate, stripHtml } from '../text.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../types.js';

type AshbyCompensationComponent = {
  compensationType?: string;
  minValue?: number;
  maxValue?: number;
  currencyCode?: string;
  interval?: string;
};

type AshbyJob = {
  id?: string;
  title?: string;
  departmentName?: string;
  teamName?: string;
  employmentType?: string;
  locationName?: string;
  secondaryLocations?: Array<{ locationName?: string }>;
  isRemote?: boolean;
  publishedDate?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTiers?: Array<{
      components?: AshbyCompensationComponent[];
    }>;
  };
};

type AshbyPayload = {
  jobs?: AshbyJob[];
};

function ashbyUrl(boardName: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}?includeCompensation=true`;
}

function compensation(job: AshbyJob): { min: number | null; max: number | null; currency: string | null } {
  const components = job.compensation?.compensationTiers?.flatMap((tier) => tier.components ?? []) ?? [];
  const salary = components.find((item) => /salary|hourly|compensation/i.test(asString(item.compensationType))) ?? components[0];
  if (!salary) {
    return { min: null, max: null, currency: null };
  }
  return {
    min: asFiniteNumber(salary.minValue),
    max: asFiniteNumber(salary.maxValue),
    currency: asOptionalString(salary.currencyCode)?.toUpperCase() ?? null,
  };
}

export function normalizeAshbyJob(raw: AshbyJob, source: SourceConfig): NormalizedJob | null {
  const externalJobId = asString(raw.id);
  const title = asString(raw.title);
  const applyUrl = firstNonEmpty(raw.applyUrl, raw.jobUrl);
  if (!externalJobId || !title || !applyUrl) {
    return null;
  }
  const html = sanitizeJobHtml(asString(raw.descriptionHtml));
  const locationName = firstNonEmpty(raw.locationName, raw.secondaryLocations?.[0]?.locationName);
  const parsed = parseLocation(locationName, [raw.isRemote ? 'remote' : null]);
  const pay = compensation(raw);
  return {
    externalJobId,
    title,
    companyName: source.companyName,
    companyLogoUrl: source.companyLogoUrl,
    descriptionHtml: html,
    descriptionText: firstNonEmpty(raw.descriptionPlain, stripHtml(html)) ?? '',
    location: parsed.location,
    country: parsed.country,
    state: parsed.state,
    city: parsed.city,
    remoteType: raw.isRemote ? 'remote' : parsed.remoteType ?? inferRemoteType(parsed.location, [title]),
    employmentType: normalizeEmploymentType(raw.employmentType),
    salaryMin: pay.min,
    salaryMax: pay.max,
    salaryCurrency: pay.currency,
    experienceLevel: null,
    postedAt: parseDate(raw.publishedDate),
    updatedAtSource: parseDate(raw.publishedDate),
    expiresAt: null,
    applyUrl,
    sourceUrl: firstNonEmpty(raw.jobUrl, applyUrl) ?? applyUrl,
  };
}

export class AshbyAdapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    const boardName = source.boardToken.trim();
    if (!boardName) {
      throw new SafeFetchError('BAD_SOURCE', 'Ashby sources require a board name');
    }
    let payload: AshbyPayload;
    try {
      payload = await safeFetchJson<AshbyPayload>(ashbyUrl(boardName));
    } catch (error) {
      if (error instanceof SafeFetchError && error.status === 404) {
        throw new SafeFetchError('BAD_SOURCE', 'Ashby board name was not found', 404);
      }
      throw error;
    }
    const collected: RawJob[] = [];
    for (const job of payload.jobs ?? []) {
      const id = asString(job.id);
      if (id) {
        collected.push({ externalId: id, payload: job });
      }
    }
    return collected;
  }

  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null {
    return normalizeAshbyJob((rawJob.payload ?? {}) as AshbyJob, source);
  }
}
