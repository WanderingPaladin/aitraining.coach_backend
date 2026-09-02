import type { JobSourceType } from '@prisma/client';
import type { JobSourceAdapter } from '../types.js';
import { AshbyAdapter } from './ashby.js';
import { CustomAdapter } from './custom/index.js';
import { GreenhouseAdapter } from './greenhouse.js';
import { JsonLdAdapter } from './jsonld.js';
import { LeverAdapter } from './lever.js';

const adapters: Record<JobSourceType, JobSourceAdapter> = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  jsonld: new JsonLdAdapter(),
  custom: new CustomAdapter(),
};

export function getAdapter(sourceType: JobSourceType): JobSourceAdapter {
  return adapters[sourceType];
}

export const SOURCE_IDENTIFIER_HELP: Record<JobSourceType, string> = {
  greenhouse: 'Board token from boards.greenhouse.io/{token} or boards-api.greenhouse.io/v1/boards/{token}/jobs',
  lever: 'Site identifier from jobs.lever.co/{site} or api.lever.co/v0/postings/{site}',
  ashby: 'Board name from jobs.ashbyhq.com/{boardName}',
  jsonld: 'Leave the board token empty and set Careers URL to the public jobs page that embeds JobPosting JSON-LD',
  custom: 'Adapter key for a registered custom module in job-collector/sources/custom',
};
