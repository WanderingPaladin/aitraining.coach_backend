import { describe, expect, it } from 'vitest';
import { markdownToJobHtml } from '../src/modules/job-collector/html.js';
import {
  extractMicro1JobStatus,
  isClosedMarketplaceStatus,
  parseMercorListingId,
  parseMicro1PostId,
  parseSitemapLocs,
} from '../src/modules/job-collector/portal-url.js';
import { isOpenMicro1Posting } from '../src/modules/job-collector/sources/custom/micro1.js';
import {
  extractMercorListings,
  isOpenMercorListing,
  normalizeMercorListing,
} from '../src/modules/job-collector/sources/custom/mercor.js';
import { customAdapters } from '../src/modules/job-collector/sources/custom/index.js';
import type { SourceConfig } from '../src/modules/job-collector/types.js';

const source: SourceConfig = {
  id: 'src_m',
  companyName: 'Mercor',
  companySlug: 'mercor',
  companyLogoUrl: null,
  sourceType: 'custom',
  boardToken: 'mercor',
  careersUrl: 'https://work.mercor.com/explore',
  priority: 40,
};

describe('marketplace URL parsing', () => {
  it('reads micro1 posting ids and Mercor listing ids', () => {
    expect(parseMicro1PostId('https://jobs.micro1.ai/post/84befcad-ab9b-4a86-9165-af51332211fb')).toBe(
      '84befcad-ab9b-4a86-9165-af51332211fb',
    );
    expect(parseMercorListingId('https://work.mercor.com/jobs/list_AAABmufp0nEJ9k46OxFK26uk/coding-expert')).toBe(
      'list_AAABmufp0nEJ9k46OxFK26uk',
    );
    expect(parseMicro1PostId('https://www.micro1.ai/experts')).toBeNull();
    expect(parseMercorListingId('https://jobs.ashbyhq.com/mercor')).toBeNull();
  });

  it('parses sitemap loc values', () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://jobs.micro1.ai/post/11111111-1111-1111-1111-111111111111</loc></url></urlset>`;
    expect(parseSitemapLocs(xml)).toEqual(['https://jobs.micro1.ai/post/11111111-1111-1111-1111-111111111111']);
  });
});

describe('micro1 open/closed detection', () => {
  it('treats escaped job_status=closed as closed', () => {
    const html = 'prefix \\"job_status\\":\\"closed\\",\\"create_datetime\\" suffix';
    expect(extractMicro1JobStatus(html)).toBe('closed');
    expect(isClosedMarketplaceStatus('closed')).toBe(true);
    expect(isOpenMicro1Posting(html, { title: 'AI Trainer' })).toBe(false);
  });

  it('keeps open postings', () => {
    const html = 'prefix \\"job_status\\":\\"open\\" suffix';
    expect(isOpenMicro1Posting(html, { title: 'AI Trainer', validThrough: '2020-01-01T00:00:00.000Z' })).toBe(true);
  });
});

describe('Mercor explore catalog', () => {
  it('reads listings from __NEXT_DATA__ and skips waitlists', () => {
    const html = `<script id="__NEXT_DATA__">${JSON.stringify({
      props: {
        pageProps: {
          dehydratedState: {
            queries: [
              {
                state: {
                  data: {
                    listings: [
                      {
                        listingId: 'list_AAABopen',
                        title: 'Coding Expert',
                        status: 'active',
                        commitment: 'hourly',
                        location: 'Remote',
                        description: '## Role\n\nEvaluate model output.\n\n- Rate answers',
                        rateMin: 70,
                        rateMax: 80,
                        postedAt: '2026-01-15T00:00:00.000Z',
                      },
                      {
                        listingId: 'list_AAABwait',
                        title: 'Machine Learning Engineer Talent Network',
                        status: 'active',
                        description: 'Join the network',
                      },
                      {
                        listingId: 'list_AAABclosed',
                        title: 'Closed Expert',
                        status: 'closed',
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    })}</script>`;
    const listings = extractMercorListings(html);
    expect(listings).toHaveLength(3);
    expect(listings.filter(isOpenMercorListing)).toHaveLength(1);
    const job = normalizeMercorListing(listings[0]!, source);
    expect(job?.title).toBe('Coding Expert');
    expect(job?.employmentType).toBe('contract');
    expect(job?.salaryMin).toBe(70);
    expect(job?.applyUrl).toContain('/jobs/list_AAABopen/');
    expect(job?.descriptionHtml).toContain('<li>');
  });
});

describe('markdownToJobHtml', () => {
  it('converts headings, lists, and bold text', () => {
    const html = markdownToJobHtml('## Role\n\nEvaluate **models**.\n\n- Rate answers\n- Write feedback');
    expect(html).toContain('<h3>');
    expect(html).toContain('<strong>models</strong>');
    expect(html).toContain('<li>');
  });
});

describe('custom adapter registry', () => {
  it('registers micro1 and mercor', () => {
    expect(customAdapters.has('micro1')).toBe(true);
    expect(customAdapters.has('mercor')).toBe(true);
  });
});
