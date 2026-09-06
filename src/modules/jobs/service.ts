import type { Job, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { isBeginnerFriendlyJob, jobToMatchOpportunity } from '../../lib/jobMatch.js';
import { canScoreMatch, scoreOpportunity, type MatchProfile } from '../../lib/matchScore.js';
import { excerptDescription } from '../job-collector/text.js';
import { PUBLISH_MIN_SCORE, REVIEW_MIN_SCORE } from '../job-collector/types.js';
import type { listJobsQuery } from './schema.js';

const MARKETPLACE_SLUGS = ['snorkel', 'handshake', 'outlier', 'micro1', 'dataannotation', 'mercor'] as const;

const sourceSelect = {
  companyName: true,
  companySlug: true,
  sourceType: true,
} satisfies Prisma.JobSourceSelect;

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
  experienceLevel: true,
  source: { select: sourceSelect },
} satisfies Prisma.JobSelect;

export const publicJobDetailSelect = {
  ...publicJobSelect,
  descriptionHtml: true,
  descriptionText: true,
  expiresAt: true,
} satisfies Prisma.JobSelect;

export const publicJobMatchSelect = {
  ...publicJobSelect,
  descriptionText: true,
} satisfies Prisma.JobSelect;

type PublicJobMatch = Prisma.JobGetPayload<{ select: typeof publicJobMatchSelect }>;
type PublicJob = Prisma.JobGetPayload<{ select: typeof publicJobSelect }>;
type PublicJobDetail = Prisma.JobGetPayload<{ select: typeof publicJobDetailSelect }>;
type JobSourceInfo = PublicJob['source'];

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

function jobOrigin(source: JobSourceInfo | null | undefined, companyName: string) {
  const slug = source?.companySlug?.toLowerCase() ?? '';
  if (slug && MARKETPLACE_SLUGS.includes(slug as (typeof MARKETPLACE_SLUGS)[number])) {
    return { origin: source?.companyName || companyName, originKind: 'marketplace' as const };
  }
  return { origin: 'External opportunity', originKind: 'employer' as const };
}

function experienceWhere(experience: string): Prisma.JobWhereInput | null {
  if (!experience) return null;
  const terms: Record<string, string[]> = {
    beginner: ['beginner', 'entry', 'junior', 'intern', 'internship'],
    entry: ['entry', 'junior'],
    mid: ['mid', 'intermediate'],
    senior: ['senior'],
    lead: ['lead', 'principal', 'staff', 'head'],
  };
  const needles = terms[experience];
  if (!needles) return null;
  const or: Prisma.JobWhereInput[] = needles.flatMap((term) => [
    { experienceLevel: { contains: term, mode: 'insensitive' as const } },
    { title: { contains: term, mode: 'insensitive' as const } },
  ]);
  if (experience === 'beginner') {
    or.push({ employmentType: 'internship' });
  }
  return { OR: or };
}

function payWhere(pay: string): Prisma.JobWhereInput | null {
  if (pay === 'compensation') {
    return { OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] };
  }
  if (pay === 'hourly') {
    return {
      AND: [
        { OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] },
        { OR: [{ salaryMin: null }, { salaryMin: { lte: 400 } }] },
        { OR: [{ salaryMax: null }, { salaryMax: { lte: 400 } }] },
      ],
    };
  }
  if (pay === 'annual') {
    return { OR: [{ salaryMin: { gte: 10_000 } }, { salaryMax: { gte: 10_000 } }] };
  }
  return null;
}

function platformWhere(company: string, platform: string): Prisma.JobWhereInput | null {
  if (platform === 'other') {
    return {
      NOT: {
        OR: MARKETPLACE_SLUGS.flatMap((slug) => [
          { companyName: { equals: slug, mode: 'insensitive' as const } },
          { source: { is: { companySlug: slug } } },
        ]),
      },
    };
  }
  const value = company || (platform && platform !== 'other' ? platform : '');
  if (!value) return null;
  return {
    OR: [
      { companyName: { equals: value, mode: 'insensitive' } },
      { source: { is: { companySlug: { equals: value.toLowerCase() } } } },
      { source: { is: { companyName: { equals: value, mode: 'insensitive' } } } },
    ],
  };
}

export function serializePublicJob(
  job: PublicJob & { descriptionText?: string },
  extras?: { match?: ReturnType<typeof scoreOpportunity> },
) {
  const descriptionText = job.descriptionText ?? '';
  const origin = jobOrigin(job.source, job.companyName);
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
    experienceLevel: job.experienceLevel,
    summary: excerptDescription(descriptionText),
    beginnerFriendly: isBeginnerFriendlyJob(job.experienceLevel, `${job.title} ${descriptionText}`),
    origin: origin.origin,
    originKind: origin.originKind,
    match: extras?.match ?? null,
  };
}

export function serializePublicJobDetail(
  job: PublicJobDetail,
  extras?: { match?: ReturnType<typeof scoreOpportunity> },
) {
  return {
    ...serializePublicJob(job, extras),
    descriptionHtml: job.descriptionHtml,
    descriptionText: job.descriptionText,
    expiresAt: job.expiresAt?.toISOString() ?? null,
  };
}

function buildPublicJobWhere(input: ReturnType<typeof listJobsQuery.parse>): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];
  if (input.q) {
    and.push({
      OR: [
        { title: { contains: input.q, mode: 'insensitive' } },
        { companyName: { contains: input.q, mode: 'insensitive' } },
        { category: { contains: input.q, mode: 'insensitive' } },
        { location: { contains: input.q, mode: 'insensitive' } },
      ],
    });
  }
  if (input.location) {
    and.push({
      OR: [
        { location: { contains: input.location, mode: 'insensitive' } },
        { city: { contains: input.location, mode: 'insensitive' } },
        { state: { contains: input.location, mode: 'insensitive' } },
        { country: { contains: input.location, mode: 'insensitive' } },
      ],
    });
  }
  const experience = experienceWhere(input.experience);
  if (experience) and.push(experience);
  const pay = payWhere(input.pay);
  if (pay) and.push(pay);
  const platform = platformWhere(input.company, input.platform);
  if (platform) and.push(platform);
  if (input.postedWithin) {
    const days = Number(input.postedWithin);
    and.push({ postedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } });
  }

  return {
    ...publicWhere,
    ...(input.remote ? { remoteType: input.remote } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.employmentType ? { employmentType: input.employmentType } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

function listOrderBy(
  sort: ReturnType<typeof listJobsQuery.parse>['sort'],
  useMatchSort: boolean,
): Prisma.JobOrderByWithRelationInput[] {
  if (useMatchSort) {
    return [{ postedAt: 'desc' }, { createdAt: 'desc' }];
  }
  if (sort === 'relevant') {
    return [{ relevanceScore: 'desc' }, { postedAt: 'desc' }];
  }
  if (sort === 'salary') {
    return [
      { salaryMax: { sort: 'desc', nulls: 'last' } },
      { salaryMin: { sort: 'desc', nulls: 'last' } },
      { postedAt: 'desc' },
    ];
  }
  return [{ postedAt: 'desc' }, { createdAt: 'desc' }];
}

export async function listPublicJobs(
  input: ReturnType<typeof listJobsQuery.parse>,
  options?: { matchProfile?: MatchProfile | null },
) {
  const where = buildPublicJobWhere(input);
  const canMatch = Boolean(options?.matchProfile && canScoreMatch(options.matchProfile));
  const matchProfile = options?.matchProfile ?? null;
  const useMatchSort = input.sort === 'match' && canMatch;
  const orderBy = listOrderBy(input.sort, useMatchSort);
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
  const filters = {
    categories: categories.map((item) => item.category).filter((item): item is string => Boolean(item)).sort(),
    companies: companies.map((item) => item.companyName),
    employmentTypes: employmentTypes
      .map((item) => item.employmentType)
      .filter((item): item is string => Boolean(item))
      .sort(),
  };

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
      filters,
    };
  }

  const select = canMatch ? publicJobMatchSelect : publicJobMatchSelect;
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
    : (jobs as PublicJobMatch[]).map((job) => serializePublicJob(job));

  return {
    jobs: serialized,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    matchAvailable: canMatch,
    filters,
  };
}

export async function getPublicJob(slug: string, extras?: { matchProfile?: MatchProfile | null }) {
  const job = await prisma.job.findFirst({
    where: { slug, ...publicWhere },
    select: publicJobDetailSelect,
  });
  if (!job) {
    throw notFound('JOB_NOT_FOUND', 'Opportunity not found');
  }
  const match =
    extras?.matchProfile && canScoreMatch(extras.matchProfile)
      ? scoreOpportunity(extras.matchProfile, jobToMatchOpportunity(job))
      : null;
  return serializePublicJobDetail(job, { match: match ?? undefined });
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
