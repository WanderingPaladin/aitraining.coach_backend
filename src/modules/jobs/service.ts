import type { Job, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { jobToMatchOpportunity } from '../../lib/jobMatch.js';
import { canScoreMatch, scoreOpportunity, type MatchProfile } from '../../lib/matchScore.js';
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

export const publicJobMatchSelect = {
  ...publicJobSelect,
  descriptionText: true,
  experienceLevel: true,
} satisfies Prisma.JobSelect;

type PublicJobMatch = Prisma.JobGetPayload<{ select: typeof publicJobMatchSelect }>;
type PublicJob = Prisma.JobGetPayload<{ select: typeof publicJobSelect }>;
type PublicJobDetail = Prisma.JobGetPayload<{ select: typeof publicJobDetailSelect }>;

function scorePublicJob(job: PublicJobMatch, matchProfile: MatchProfile) {
  return scoreOpportunity(matchProfile, jobToMatchOpportunity(job));
}

function serializeScoredJobs(
  rows: Array<{ job: PublicJobMatch; match: ReturnType<typeof scoreOpportunity> | null }>,
) {
  return rows.map(({ job, match }) => serializePublicJob(job, { match: match ?? undefined }));
}

const publicWhere: Prisma.JobWhereInput = {
  isActive: true,
  isDuplicate: false,
  relevanceScore: { gte: PUBLISH_MIN_SCORE },
};

export function serializePublicJob(
  job: PublicJob,
  extras?: { match?: ReturnType<typeof scoreOpportunity> },
) {
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
    match: extras?.match ?? null,
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

export async function listPublicJobs(
  input: ReturnType<typeof listJobsQuery.parse>,
  options?: { matchProfile?: MatchProfile | null },
) {
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

  const canMatch = Boolean(options?.matchProfile && canScoreMatch(options.matchProfile));
  const matchProfile = options?.matchProfile ?? null;
  const useMatchSort = input.sort === 'match' && canMatch;

  const orderBy: Prisma.JobOrderByWithRelationInput[] = useMatchSort
    ? [{ postedAt: 'desc' }, { createdAt: 'desc' }]
    : input.sort === 'relevant'
      ? [{ relevanceScore: 'desc' }, { postedAt: 'desc' }]
      : [{ postedAt: 'desc' }, { createdAt: 'desc' }];

  const skip = (input.page - 1) * input.pageSize;

  const [total, filterMeta] = await Promise.all([
    prisma.job.count({ where }),
    Promise.all([
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
    ]),
  ]);

  const [categories, companies, employmentTypes] = filterMeta;

  if (useMatchSort && matchProfile) {
    const allJobs = await prisma.job.findMany({
      where,
      select: publicJobMatchSelect,
      take: 500,
    });
    const scored = allJobs
      .map((job) => ({ job, match: scorePublicJob(job, matchProfile) }))
      .sort(
        (left, right) =>
          (right.match?.score ?? -1) - (left.match?.score ?? -1) ||
          (Date.parse(right.job.postedAt?.toISOString() ?? '') || 0) -
            (Date.parse(left.job.postedAt?.toISOString() ?? '') || 0),
      );
    const pageJobs = scored.slice(skip, skip + input.pageSize);
    return {
      jobs: serializeScoredJobs(pageJobs),
      total: scored.length,
      page: input.page,
      pageSize: input.pageSize,
      pageCount: Math.max(1, Math.ceil(scored.length / input.pageSize)),
      matchAvailable: true,
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

  const select = canMatch ? publicJobMatchSelect : publicJobSelect;
  const jobs = await prisma.job.findMany({
    where,
    select,
    orderBy,
    skip,
    take: input.pageSize,
  });

  const serialized = canMatch && matchProfile
    ? serializeScoredJobs(
        (jobs as PublicJobMatch[]).map((job) => ({
          job,
          match: scorePublicJob(job, matchProfile),
        })),
      )
    : (jobs as PublicJob[]).map((job) => serializePublicJob(job));

  return {
    jobs: serialized,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    matchAvailable: canMatch,
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
