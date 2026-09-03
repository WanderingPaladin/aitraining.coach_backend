import { describe, expect, it } from 'vitest';
import { parseAtsUrl } from '../src/modules/job-collector/ats-url.js';

describe('parseAtsUrl', () => {
  it('reads Greenhouse board tokens from hosted and API URLs', () => {
    expect(parseAtsUrl('https://boards.greenhouse.io/acmelabs/jobs/123')?.boardToken).toBe('acmelabs');
    expect(parseAtsUrl('https://job-boards.greenhouse.io/acmelabs/jobs/123')?.sourceType).toBe('greenhouse');
    expect(parseAtsUrl('https://boards-api.greenhouse.io/v1/boards/acmelabs/jobs')?.boardToken).toBe('acmelabs');
  });

  it('reads Lever and Ashby site slugs', () => {
    expect(parseAtsUrl('https://jobs.lever.co/surgeai/abcd')?.boardToken).toBe('surgeai');
    expect(parseAtsUrl('https://api.lever.co/v0/postings/surgeai')?.sourceType).toBe('lever');
    expect(parseAtsUrl('https://jobs.ashbyhq.com/labelbox/job/abc')?.boardToken).toBe('labelbox');
    expect(parseAtsUrl('https://api.ashbyhq.com/posting-api/job-board/labelbox')?.sourceType).toBe('ashby');
  });

  it('ignores non-ATS links and generic path segments', () => {
    expect(parseAtsUrl('https://outlier.ai/careers')).toBeNull();
    expect(parseAtsUrl('https://boards.greenhouse.io/embed/job_board?for=acme')).toBeNull();
    expect(parseAtsUrl('https://jobs.lever.co/jobs/abc')).toBeNull();
    expect(parseAtsUrl('https://jobs.micro1.ai/post/84befcad-ab9b-4a86-9165-af51332211fb')).toBeNull();
    expect(parseAtsUrl('https://work.mercor.com/jobs/list_AAABmufp0nEJ9k46OxFK26uk/coding-expert')).toBeNull();
    expect(parseAtsUrl('not a url')).toBeNull();
  });
});
