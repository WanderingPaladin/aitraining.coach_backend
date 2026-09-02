import type { JobSourceType } from '@prisma/client';

export type SourceConfig = {
  id: string;
  companyName: string;
  companySlug: string;
  companyLogoUrl: string | null;
  sourceType: JobSourceType;
  boardToken: string;
  careersUrl: string;
  priority: number;
};

export type RawJob = {
  externalId: string;
  payload: unknown;
};

export type NormalizedJob = {
  externalJobId: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  descriptionHtml: string;
  descriptionText: string;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  remoteType: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  experienceLevel: string | null;
  postedAt: Date | null;
  updatedAtSource: Date | null;
  expiresAt: Date | null;
  applyUrl: string;
  sourceUrl: string;
};

export type ClassifiedJob = NormalizedJob & {
  category: string;
  relevanceScore: number;
  fingerprint: string;
};

export interface JobSourceAdapter {
  fetchJobs(source: SourceConfig): Promise<RawJob[]>;
  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null;
}

export type SyncLogger = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export const JOB_CATEGORIES = [
  'Coding',
  'Writing',
  'Math',
  'Science',
  'Legal',
  'Finance',
  'Healthcare',
  'Language',
  'General AI Training',
  'Data Annotation',
  'AI Evaluation',
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const PUBLISH_MIN_SCORE = 40;
export const REVIEW_MIN_SCORE = 20;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CRAWL_FREQUENCY_MINUTES = 360;
export const JOB_BOT_USER_AGENT = 'AITrainersCoachJobBot/1.0 (+https://aitrainers.coach)';

export const ATS_SOURCE_TYPES: JobSourceType[] = ['greenhouse', 'lever', 'ashby'];

export function isPublicJob(job: {
  isActive: boolean;
  isDuplicate: boolean;
  relevanceScore: number;
}): boolean {
  return job.isActive && !job.isDuplicate && job.relevanceScore >= PUBLISH_MIN_SCORE;
}
