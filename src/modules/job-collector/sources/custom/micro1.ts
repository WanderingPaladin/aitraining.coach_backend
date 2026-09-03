import { delay, SafeFetchError, safeFetch } from '../../http.js';
import { inferRemoteType, normalizeEmploymentType, parseLocation } from '../../location.js';
import {
  extractMicro1JobStatus,
  isClosedMarketplaceStatus,
  parseMicro1PostId,
  parseSitemapLocs,
} from '../../portal-url.js';
import { assertRobotsAllowed } from '../../robots.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../../types.js';
import { extractJobPostings, normalizeJsonLdJob } from '../jsonld.js';

const SITEMAP_URL = 'https://jobs.micro1.ai/sitemap.xml';
const MAX_POSTS = 400;

type Micro1Payload = {
  pageUrl: string;
  posting: Record<string, unknown>;
};

export function isOpenMicro1Posting(html: string, posting: Record<string, unknown>): boolean {
  const status = extractMicro1JobStatus(html);
  if (isClosedMarketplaceStatus(status)) {
    return false;
  }
  const visible = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (visible.includes('currently closed and not accepting') || visible.includes('this job is currently closed')) {
    return false;
  }
  if (!status) {
    const validThrough = posting.validThrough;
    if (typeof validThrough === 'string') {
      const expiry = new Date(validThrough);
      if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        return false;
      }
    }
  }
  return Boolean(posting.title);
}

export class Micro1Adapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    await assertRobotsAllowed(SITEMAP_URL);
    const sitemap = await safeFetch(SITEMAP_URL, {
      accept: 'application/xml, text/xml, */*;q=0.8',
      timeoutMs: 20_000,
    });
    const postUrls = parseSitemapLocs(sitemap.text)
      .map((loc) => {
        const id = parseMicro1PostId(loc);
        return id ? `https://jobs.micro1.ai/post/${id}` : null;
      })
      .filter((url): url is string => Boolean(url))
      .slice(0, MAX_POSTS);

    const collected: RawJob[] = [];
    for (const pageUrl of postUrls) {
      try {
        await assertRobotsAllowed(pageUrl);
        const page = await safeFetch(pageUrl, { accept: 'text/html', timeoutMs: 12_000 });
        const posting = extractJobPostings(page.text)[0];
        if (!posting || !isOpenMicro1Posting(page.text, posting)) {
          continue;
        }
        const id = parseMicro1PostId(pageUrl) ?? parseMicro1PostId(page.url);
        if (!id) {
          continue;
        }
        const payload: Micro1Payload = { pageUrl: `https://jobs.micro1.ai/post/${id}`, posting };
        collected.push({ externalId: id, payload });
      } catch (error) {
        if (error instanceof SafeFetchError) {
          continue;
        }
        throw error;
      }
      await delay(120);
    }

    if (collected.length === 0 && postUrls.length === 0) {
      throw new SafeFetchError('BAD_SOURCE', `No micro1 posting URLs found for ${source.companySlug}`);
    }
    return collected;
  }

  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null {
    const payload = (rawJob.payload ?? {}) as Micro1Payload;
    const posting = payload.posting ?? {};
    const pageUrl = payload.pageUrl || `https://jobs.micro1.ai/post/${rawJob.externalId}`;
    const normalized = normalizeJsonLdJob(posting, { ...source, companyName: 'micro1' }, pageUrl);
    if (!normalized) {
      return null;
    }
    const parsed = parseLocation(normalized.location, [normalized.descriptionText, 'Remote']);
    return {
      ...normalized,
      companyName: 'micro1',
      externalJobId: rawJob.externalId,
      applyUrl: pageUrl,
      sourceUrl: pageUrl,
      remoteType: normalized.remoteType ?? parsed.remoteType ?? inferRemoteType('Remote', [normalized.title]),
      employmentType: normalized.employmentType ?? normalizeEmploymentType(posting.employmentType) ?? 'contract',
    };
  }
}
