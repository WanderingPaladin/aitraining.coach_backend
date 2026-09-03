import type { JobSource, JobSourceType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { assertPublicUrl } from '../job-collector/http.js';
import { slugify } from '../job-collector/text.js';
import { PUBLISH_MIN_SCORE, REVIEW_MIN_SCORE } from '../job-collector/types.js';
import { jobVisibility } from './service.js';
import type { listAdminJobsQuery, upsertJobSourceBody } from './schema.js';

type SourceInput = ReturnType<typeof upsertJobSourceBody.parse>;

export function serializeJobSource(
  source: JobSource,
  extras?: {
    lastRun?: { status: string; finishedAt: Date | null; jobsFetched: number; errorMessage: string | null } | null;
    jobCount?: number;
  },
) {
  return {
    id: source.id,
    companyName: source.companyName,
    companySlug: source.companySlug,
    companyLogoUrl: source.companyLogoUrl,
    sourceType: source.sourceType,
    boardToken: source.boardToken,
    careersUrl: source.careersUrl,
    enabled: source.enabled,
    priority: source.priority,
    crawlFrequencyMinutes: source.crawlFrequencyMinutes,
    lastCrawledAt: source.lastCrawledAt?.toISOString() ?? null,
    lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    lastError: source.lastError,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    jobCount: extras?.jobCount ?? 0,
    lastRun: extras?.lastRun
      ? {
          status: extras.lastRun.status,
          finishedAt: extras.lastRun.finishedAt?.toISOString() ?? null,
          jobsFetched: extras.lastRun.jobsFetched,
          errorMessage: extras.lastRun.errorMessage,
        }
      : null,
  };
}

function validateSourceInput(input: SourceInput): void {
  if (input.sourceType === 'greenhouse' || input.sourceType === 'lever' || input.sourceType === 'ashby') {
    if (!input.boardToken.trim()) {
      throw badRequest('INVALID_SOURCE', 'API sources require a board token / site identifier');
    }
  }
  if (input.sourceType === 'jsonld') {
    if (!input.careersUrl.trim()) {
      throw badRequest('INVALID_SOURCE', 'JSON-LD sources require a careers URL');
    }
  }
  if (input.sourceType === 'custom' && !input.boardToken.trim()) {
    throw badRequest('INVALID_SOURCE', 'Custom sources require a registered adapter key as the board token');
  }
  if (input.careersUrl.trim()) {
    try {
      assertPublicUrl(input.careersUrl.trim());
    } catch {
      throw badRequest('INVALID_SOURCE', 'Careers URL must be a public http(s) URL');
    }
  }
  if (input.companyLogoUrl) {
    try {
      assertPublicUrl(input.companyLogoUrl);
    } catch {
      throw badRequest('INVALID_SOURCE', 'Company logo URL must be a public http(s) URL');
    }
  }
}

export async function listJobSources() {
  const sources = await prisma.jobSource.findMany({
    orderBy: [{ priority: 'asc' }, { companyName: 'asc' }],
    include: {
      _count: { select: { jobs: true } },
      syncRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
    },
  });
  return sources.map((source) =>
    serializeJobSource(source, {
      jobCount: source._count.jobs,
      lastRun: source.syncRuns[0]
        ? {
            status: source.syncRuns[0].status,
            finishedAt: source.syncRuns[0].finishedAt,
            jobsFetched: source.syncRuns[0].jobsFetched,
            errorMessage: source.syncRuns[0].errorMessage,
          }
        : null,
    }),
  );
}

export async function createJobSource(input: SourceInput) {
  validateSourceInput(input);
  const source = await prisma.jobSource.create({
    data: {
      companyName: input.companyName,
      companySlug: input.companySlug || slugify(input.companyName),
      companyLogoUrl: input.companyLogoUrl,
      sourceType: input.sourceType,
      boardToken: input.boardToken.trim(),
      careersUrl: input.careersUrl.trim(),
      enabled: input.enabled,
      priority: input.priority,
      crawlFrequencyMinutes: input.crawlFrequencyMinutes,
    },
  });
  return serializeJobSource(source, { jobCount: 0, lastRun: null });
}

export async function updateJobSource(id: string, input: Partial<SourceInput>) {
  const existing = await prisma.jobSource.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('SOURCE_NOT_FOUND', 'Job source not found');
  }
  const merged = {
    companyName: input.companyName ?? existing.companyName,
    companySlug: input.companySlug || existing.companySlug || slugify(input.companyName ?? existing.companyName),
    companyLogoUrl: input.companyLogoUrl === undefined ? existing.companyLogoUrl : input.companyLogoUrl,
    sourceType: (input.sourceType ?? existing.sourceType) as JobSourceType,
    boardToken: input.boardToken ?? existing.boardToken,
    careersUrl: input.careersUrl ?? existing.careersUrl,
    enabled: input.enabled ?? existing.enabled,
    priority: input.priority ?? existing.priority,
    crawlFrequencyMinutes: input.crawlFrequencyMinutes ?? existing.crawlFrequencyMinutes,
  };
  validateSourceInput(merged);
  const source = await prisma.jobSource.update({
    where: { id },
    data: merged,
  });
  return serializeJobSource(source);
}

export async function getJobSource(id: string) {
  const source = await prisma.jobSource.findUnique({
    where: { id },
    include: {
      _count: { select: { jobs: true } },
      syncRuns: { orderBy: { startedAt: 'desc' }, take: 5 },
    },
  });
  if (!source) {
    throw notFound('SOURCE_NOT_FOUND', 'Job source not found');
  }
  return {
    source: serializeJobSource(source, {
      jobCount: source._count.jobs,
      lastRun: source.syncRuns[0]
        ? {
            status: source.syncRuns[0].status,
            finishedAt: source.syncRuns[0].finishedAt,
            jobsFetched: source.syncRuns[0].jobsFetched,
            errorMessage: source.syncRuns[0].errorMessage,
          }
        : null,
    }),
    runs: source.syncRuns.map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      jobsFetched: run.jobsFetched,
      jobsInserted: run.jobsInserted,
      jobsUpdated: run.jobsUpdated,
      jobsRejected: run.jobsRejected,
      errorMessage: run.errorMessage,
    })),
  };
}

export async function listAdminJobs(input: ReturnType<typeof listAdminJobsQuery.parse>) {
  const where = {
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.q
      ? {
          OR: [
            { title: { contains: input.q, mode: 'insensitive' as const } },
            { companyName: { contains: input.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(input.visibility === 'published'
      ? { isActive: true, isDuplicate: false, relevanceScore: { gte: PUBLISH_MIN_SCORE } }
      : input.visibility === 'review'
        ? {
            isActive: true,
            isDuplicate: false,
            relevanceScore: { gte: REVIEW_MIN_SCORE, lt: PUBLISH_MIN_SCORE },
          }
        : input.visibility === 'hidden'
          ? {
              OR: [{ isActive: false }, { isDuplicate: true }, { relevanceScore: { lt: REVIEW_MIN_SCORE } }],
            }
          : {}),
  };
  const skip = (input.page - 1) * input.pageSize;
  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      include: { source: { select: { companyName: true, sourceType: true } } },
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take: input.pageSize,
    }),
  ]);
  return {
    total,
    page: input.page,
    pageSize: input.pageSize,
    items: jobs.map((job) => ({
      id: job.id,
      slug: job.slug,
      title: job.title,
      companyName: job.companyName,
      location: job.location,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      category: job.category,
      relevanceScore: job.relevanceScore,
      visibility: jobVisibility(job),
      isActive: job.isActive,
      isDuplicate: job.isDuplicate,
      postedAt: job.postedAt?.toISOString() ?? null,
      lastSeenAt: job.lastSeenAt.toISOString(),
      applyUrl: job.applyUrl,
      sourceType: job.source.sourceType,
      sourceName: job.source.companyName,
    })),
  };
}

export async function setJobActive(id: string, isActive: boolean) {
  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('JOB_NOT_FOUND', 'Job not found');
  }
  const job = await prisma.job.update({ where: { id }, data: { isActive } });
  return { id: job.id, isActive: job.isActive, visibility: jobVisibility(job), relevanceScore: job.relevanceScore };
}
