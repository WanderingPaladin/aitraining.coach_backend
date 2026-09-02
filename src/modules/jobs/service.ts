import type { Job, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { PUBLISH_MIN_SCORE, REVIEW_MIN_SCORE } from '../job-collector/types.js';
import type { listJobsQuery } from './schema.js';

export const publicJobSelect = {
  id: true,
  slug: true,
  title: true,
  companyName: true,
  companyLogoUrl: true,
  location: true,
  country: true,
  state: true,
  city: true,
  remoteType: true,
  employmentType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  category: true,
  relevanceScore: true,
  postedAt: true,
  applyUrl: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobSelect;

export const publicJobDetailSelect = {
  ...publicJobSelect,
  descriptionHtml: true,
  descriptionText: true,
  experienceLevel: true,
  expiresAt: true,
} satisfies Prisma.JobSelect;

type PublicJob = Prisma.JobGetPayload<{ select: typeof publicJobSelect }>;
type PublicJobDetail = Prisma.JobGetPayload<{ select: typeof publicJobDetailSelect }>;

const publicWhere: Prisma.JobWhereInput = {
  isActive: true,
  isDuplicate: false,
  relevanceScore: { gte: PUBLISH_MIN_SCORE },
};

export function serializePublicJob(job: PublicJob) {
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    companyName: job.companyName,
    companyLogoUrl: job.companyLogoUrl,
    location: job.location,
    country: job.country,
    state: job.state,
    city: job.city,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    category: job.category,
    relevanceScore: job.relevanceScore,
    postedAt: job.postedAt?.toISOString() ?? null,
    applyUrl: job.applyUrl,
    sourceUrl: job.sourceUrl,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function serializePublicJobDetail(job: PublicJobDetail) {
  return {
    ...serializePublicJob(job),
    descriptionHtml: job.descriptionHtml,
    descriptionText: job.descriptionText,
    experienceLevel: job.experienceLevel,
    expiresAt: job.expiresAt?.toISOString() ?? null,
  };
}

export async function listPublicJobs(input: ReturnType<typeof listJobsQuery.parse>) {
  const where: Prisma.JobWhereInput = {
    ...publicWhere,
    ...(input.remote ? { remoteType: 'remote' } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.employmentType ? { employmentType: input.employmentType } : {}),
    ...(input.company ? { companyName: { equals: input.company, mode: 'insensitive' } } : {}),
    ...(input.location
      ? {
          OR: [
            { location: { contains: input.location, mode: 'insensitive' } },
            { city: { contains: input.location, mode: 'insensitive' } },
            { state: { contains: input.location, mode: 'insensitive' } },
            { country: { contains: input.location, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(input.q
      ? {
          AND: [
            {
              OR: [
                { title: { contains: input.q, mode: 'insensitive' } },
                { companyName: { contains: input.q, mode: 'insensitive' } },
                { category: { contains: input.q, mode: 'insensitive' } },
                { location: { contains: input.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.JobOrderByWithRelationInput[] =
    input.sort === 'relevant'
      ? [{ relevanceScore: 'desc' }, { postedAt: 'desc' }]
      : [{ postedAt: 'desc' }, { createdAt: 'desc' }];

  const skip = (input.page - 1) * input.pageSize;
  const [total, jobs, categories, companies, employmentTypes] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      select: publicJobSelect,
      orderBy,
      skip,
      take: input.pageSize,
    }),
    prisma.job.findMany({
      where: publicWhere,
      distinct: ['category'],
      select: { category: true },
    }),
    prisma.job.findMany({
      where: publicWhere,
      distinct: ['companyName'],
      select: { companyName: true },
      orderBy: { companyName: 'asc' },
      take: 100,
    }),
    prisma.job.findMany({
      where: publicWhere,
      distinct: ['employmentType'],
      select: { employmentType: true },
    }),
  ]);

  return {
    jobs: jobs.map(serializePublicJob),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    filters: {
      categories: categories.map((item) => item.category).filter((item): item is string => Boolean(item)).sort(),
      companies: companies.map((item) => item.companyName),
      employmentTypes: employmentTypes
        .map((item) => item.employmentType)
        .filter((item): item is string => Boolean(item))
        .sort(),
    },
  };
}

export async function getPublicJob(slug: string) {
  const job = await prisma.job.findFirst({
    where: { slug, ...publicWhere },
    select: publicJobDetailSelect,
  });
  if (!job) {
    throw notFound('JOB_NOT_FOUND', 'Opportunity not found');
  }
  return serializePublicJobDetail(job);
}

export async function listPublicJobSitemap() {
  const jobs = await prisma.job.findMany({
    where: publicWhere,
    select: { slug: true, updatedAt: true, postedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  });
  return jobs.map((job) => ({
    slug: job.slug,
    updatedAt: job.updatedAt.toISOString(),
  }));
}

export function jobVisibility(job: Pick<Job, 'isActive' | 'isDuplicate' | 'relevanceScore'>): 'published' | 'review' | 'hidden' {
  if (!job.isActive || job.isDuplicate || job.relevanceScore < REVIEW_MIN_SCORE) {
    return 'hidden';
  }
  if (job.relevanceScore >= PUBLISH_MIN_SCORE) {
    return 'published';
  }
  return 'review';
}
