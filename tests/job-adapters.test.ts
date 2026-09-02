import { describe, expect, it } from 'vitest';
import { normalizeGreenhouseJob } from '../src/modules/job-collector/sources/greenhouse.js';
import { normalizeLeverJob } from '../src/modules/job-collector/sources/lever.js';
import { normalizeAshbyJob } from '../src/modules/job-collector/sources/ashby.js';
import { extractJobPostings, normalizeJsonLdJob } from '../src/modules/job-collector/sources/jsonld.js';
import type { SourceConfig } from '../src/modules/job-collector/types.js';

const source: SourceConfig = {
  id: 'src_1',
  companyName: 'Example Labs',
  companySlug: 'example-labs',
  companyLogoUrl: 'https://cdn.example.com/logo.png',
  sourceType: 'greenhouse',
  boardToken: 'examplelabs',
  careersUrl: 'https://boards.greenhouse.io/examplelabs',
  priority: 10,
};

describe('Greenhouse normalization', () => {
  it('extracts id, title, location, html, updated date, and absolute URL', () => {
    const job = normalizeGreenhouseJob(
      {
        id: 44881,
        title: 'AI Trainer',
        absolute_url: 'https://boards.greenhouse.io/examplelabs/jobs/44881',
        updated_at: '2026-08-01T12:00:00.000Z',
        content: '<p>Review model answers for RLHF.</p><script>alert(1)</script>',
        location: { name: 'Remote - United States' },
      },
      source,
    );
    expect(job).not.toBeNull();
    expect(job!.externalJobId).toBe('44881');
    expect(job!.title).toBe('AI Trainer');
    expect(job!.applyUrl).toBe('https://boards.greenhouse.io/examplelabs/jobs/44881');
    expect(job!.remoteType).toBe('remote');
    expect(job!.descriptionHtml).toContain('<p>');
    expect(job!.descriptionHtml).not.toContain('script');
    expect(job!.updatedAtSource?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('returns null when required fields are missing', () => {
    expect(normalizeGreenhouseJob({ title: 'AI Trainer' }, source)).toBeNull();
  });
});

describe('Lever normalization', () => {
  it('maps posting fields including compensation and workplace type', () => {
    const job = normalizeLeverJob(
      {
        id: 'abc123',
        text: 'LLM Evaluator',
        hostedUrl: 'https://jobs.lever.co/examplelabs/abc123',
        applyUrl: 'https://jobs.lever.co/examplelabs/abc123/apply',
        description: '<p>Evaluate LLM responses.</p>',
        descriptionPlain: 'Evaluate LLM responses.',
        createdAt: 1720000000000,
        workplaceType: 'remote',
        categories: { location: 'New York, NY', commitment: 'Contract' },
        salaryRange: { min: 40, max: 65, currency: 'USD' },
      },
      { ...source, sourceType: 'lever' },
    );
    expect(job!.externalJobId).toBe('abc123');
    expect(job!.employmentType).toBe('contract');
    expect(job!.salaryMin).toBe(40);
    expect(job!.salaryMax).toBe(65);
    expect(job!.remoteType).toBe('remote');
    expect(job!.applyUrl).toContain('/apply');
  });
});

describe('Ashby normalization', () => {
  it('normalizes title, location, employment, compensation, and published date', () => {
    const job = normalizeAshbyJob(
      {
        id: 'job_9',
        title: 'Data Annotator',
        employmentType: 'PartTime',
        locationName: 'Austin, TX',
        isRemote: true,
        publishedDate: '2026-07-15T00:00:00.000Z',
        jobUrl: 'https://jobs.ashbyhq.com/examplelabs/job_9',
        applyUrl: 'https://jobs.ashbyhq.com/examplelabs/job_9/application',
        descriptionHtml: '<p>Annotation for model training.</p>',
        descriptionPlain: 'Annotation for model training.',
        compensation: {
          compensationTiers: [
            {
              components: [{ compensationType: 'Salary', minValue: 25, maxValue: 40, currencyCode: 'USD' }],
            },
          ],
        },
      },
      { ...source, sourceType: 'ashby' },
    );
    expect(job!.title).toBe('Data Annotator');
    expect(job!.remoteType).toBe('remote');
    expect(job!.employmentType).toBe('part-time');
    expect(job!.salaryCurrency).toBe('USD');
    expect(job!.postedAt?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(job!.applyUrl).toContain('application');
  });
});

describe('JSON-LD extraction', () => {
  it('parses a single JobPosting, arrays, @graph, and ignores malformed blocks', () => {
    const html = `
      <script type="application/ld+json">{not json</script>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"JobPosting","title":"AI Evaluator","url":"https://example.com/jobs/1","description":"<p>Evaluate models</p>","datePosted":"2026-01-01"}
      </script>
      <script type="application/ld+json">
        [{"@type":"JobPosting","title":"Domain Expert","url":"https://example.com/jobs/2","description":"SME work"}]
      </script>
      <script type="application/ld+json">
        {"@graph":[{"@type":"Organization","name":"Acme"},{"@type":"JobPosting","title":"RLHF Specialist","url":"https://example.com/jobs/3"}]}
      </script>
    `;
    const postings = extractJobPostings(html);
    expect(postings).toHaveLength(3);
    const first = normalizeJsonLdJob(postings[0]!, { ...source, sourceType: 'jsonld' }, 'https://example.com/careers');
    expect(first!.title).toBe('AI Evaluator');
    expect(first!.applyUrl).toBe('https://example.com/jobs/1');
    expect(first!.descriptionHtml).not.toContain('script');
  });
});
