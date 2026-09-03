import { z } from 'zod';
import { JOB_CATEGORIES } from '../job-collector/types.js';

export const listJobsQuery = z.object({
  q: z.string().trim().max(120).optional().default(''),
  remote: z
    .enum(['true', 'false', ''])
    .optional()
    .default('')
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : undefined)),
  location: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  employmentType: z.string().trim().max(40).optional().default(''),
  company: z.string().trim().max(80).optional().default(''),
  sort: z.enum(['newest', 'relevant', 'match']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const jobSlugParams = z.object({
  slug: z.string().min(1).max(120),
});

export const jobIdParams = z.object({
  id: z.string().min(1).max(40),
});

export const jobSourceIdParams = z.object({
  id: z.string().min(1).max(40),
});

export const jobSourceType = z.enum(['greenhouse', 'lever', 'ashby', 'jsonld', 'custom']);

export const upsertJobSourceBody = z.object({
  companyName: z.string().trim().min(1).max(120),
  companySlug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/, 'Use a lowercase slug with letters, numbers, and hyphens')
    .optional()
    .default(''),
  companyLogoUrl: z.string().url().max(500).optional().or(z.literal('')).transform((value) => value || null),
  sourceType: jobSourceType,
  boardToken: z.string().trim().max(120).optional().default(''),
  careersUrl: z.string().trim().max(500).optional().default(''),
  enabled: z.boolean().optional().default(true),
  priority: z.coerce.number().int().min(0).max(1000).optional().default(100),
  crawlFrequencyMinutes: z.coerce.number().int().min(30).max(24 * 60).optional().default(360),
});

export const patchJobSourceBody = upsertJobSourceBody.partial();

export const patchJobBody = z.object({
  isActive: z.boolean(),
});

export const listAdminJobsQuery = z.object({
  q: z.string().trim().max(120).optional().default(''),
  sourceId: z.string().trim().max(40).optional().default(''),
  visibility: z.enum(['all', 'published', 'review', 'hidden']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const JOB_CATEGORY_VALUES = JOB_CATEGORIES;
