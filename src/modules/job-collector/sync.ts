import type { JobSource } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { applyFingerprintDedupe, type DedupeCandidate } from './dedupe.js';
import { fingerprintJob } from './fingerprint.js';
import { SafeFetchError } from './http.js';
import { assignCategory, scoreRelevance } from './relevance.js';
import { getAdapter } from './sources/registry.js';
import { makeJobSlug } from './text.js';
import { type SourceConfig, type SyncLogger } from './types.js';

function consoleLogger(): SyncLogger {
  return {
    info: (obj, msg) => console.info(msg, obj),
    warn: (obj, msg) => console.warn(msg, obj),
    error: (obj, msg) => console.error(msg, obj),
  };
}

function toSourceConfig(source: JobSource): SourceConfig {
  return {
    id: source.id,
    companyName: source.companyName,
    companySlug: source.companySlug,
    companyLogoUrl: source.companyLogoUrl,
    sourceType: source.sourceType,
    boardToken: source.boardToken,
    careersUrl: source.careersUrl,
    priority: source.priority,
  };
}

export type SourceSyncResult = {
  sourceId: string;
  status: 'success' | 'partial' | 'failed';
  jobsFetched: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRejected: number;
  errorMessage: string | null;
};

async function uniqueSlug(base: string, jobId?: string): Promise<string> {
  let slug = base;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await prisma.job.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === jobId) {
      return slug;
    }
    slug = `${base}-${attempt + 2}`.slice(0, 96);
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 96);
}

async function refreshFingerprintDuplicates(fingerprint: string): Promise<void> {
  const matches = await prisma.job.findMany({
    where: { fingerprint },
    include: { source: { select: { sourceType: true, priority: true } } },
  });
  if (matches.length <= 1) {
    if (matches[0]?.isDuplicate) {
      await prisma.job.update({ where: { id: matches[0].id }, data: { isDuplicate: false } });
    }
    return;
  }
  const candidates: DedupeCandidate[] = matches.map((job) => ({
    id: job.id,
    sourceId: job.sourceId,
    sourceType: job.source.sourceType,
    sourcePriority: job.source.priority,
    fingerprint: job.fingerprint,
    isActive: job.isActive,
    isDuplicate: job.isDuplicate,
  }));
  const decided = applyFingerprintDedupe(candidates);
  await Promise.all(
    decided.map((item) =>
      prisma.job.update({
        where: { id: item.id },
        data: { isDuplicate: item.isDuplicate },
      }),
    ),
  );
}

export async function syncSource(source: JobSource, logger: SyncLogger = consoleLogger()): Promise<SourceSyncResult> {
  const startedAt = new Date();
  const run = await prisma.jobSyncRun.create({
    data: { sourceId: source.id, status: 'running', startedAt },
  });
  logger.info({ sourceId: source.id, sourceType: source.sourceType, company: source.companyName }, 'source sync started');

  let jobsFetched = 0;
  let jobsInserted = 0;
  let jobsUpdated = 0;
  let jobsRejected = 0;
  let errorMessage: string | null = null;
  let status: SourceSyncResult['status'] = 'success';

  try {
    const adapter = getAdapter(source.sourceType);
    const config = toSourceConfig(source);
    const rawJobs = await adapter.fetchJobs(config);
    jobsFetched = rawJobs.length;

    for (const raw of rawJobs) {
      const normalized = adapter.normalize(raw, config);
      if (!normalized?.applyUrl || !normalized.title) {
        jobsRejected += 1;
        continue;
      }
      const relevanceScore = scoreRelevance(normalized);
      if (relevanceScore === 0) {
        jobsRejected += 1;
        continue;
      }
      const fingerprint = fingerprintJob({
        companyName: normalized.companyName,
        title: normalized.title,
        location: normalized.location,
      });
      const category = assignCategory(normalized);
      const now = new Date();
      const existing = await prisma.job.findUnique({
        where: { sourceId_externalJobId: { sourceId: source.id, externalJobId: normalized.externalJobId } },
      });
      const slug = await uniqueSlug(
        makeJobSlug(normalized.title, normalized.companyName, normalized.externalJobId),
        existing?.id,
      );
      const data = {
        slug: existing?.slug ?? slug,
        title: normalized.title,
        companyName: normalized.companyName,
        companyLogoUrl: normalized.companyLogoUrl,
        descriptionHtml: normalized.descriptionHtml,
        descriptionText: normalized.descriptionText,
        location: normalized.location,
        country: normalized.country,
        state: normalized.state,
        city: normalized.city,
        remoteType: normalized.remoteType,
        employmentType: normalized.employmentType,
        salaryMin: normalized.salaryMin,
        salaryMax: normalized.salaryMax,
        salaryCurrency: normalized.salaryCurrency,
        experienceLevel: normalized.experienceLevel,
        category,
        relevanceScore,
        postedAt: normalized.postedAt,
        updatedAtSource: normalized.updatedAtSource,
        expiresAt: normalized.expiresAt,
        applyUrl: normalized.applyUrl,
        sourceUrl: normalized.sourceUrl,
        fingerprint,
        isActive: true,
        lastSeenAt: now,
      };

      if (existing) {
        await prisma.job.update({ where: { id: existing.id }, data });
        jobsUpdated += 1;
      } else {
        await prisma.job.create({
          data: {
            sourceId: source.id,
            externalJobId: normalized.externalJobId,
            firstSeenAt: now,
            ...data,
          },
        });
        jobsInserted += 1;
      }
      await refreshFingerprintDuplicates(fingerprint);
    }

    await prisma.jobSource.update({
      where: { id: source.id },
      data: {
        lastCrawledAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    status = jobsFetched > 0 ? 'partial' : 'failed';
    errorMessage = error instanceof SafeFetchError || error instanceof Error ? error.message : 'Unknown sync error';
    logger.error(
      { sourceId: source.id, code: error instanceof SafeFetchError ? error.code : 'SYNC_ERROR' },
      errorMessage,
    );
    await prisma.jobSource.update({
      where: { id: source.id },
      data: {
        lastCrawledAt: new Date(),
        lastError: errorMessage.slice(0, 1000),
      },
    });
  }

  await prisma.jobSyncRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status,
      jobsFetched,
      jobsInserted,
      jobsUpdated,
      jobsRejected,
      errorMessage,
    },
  });
  logger.info(
    { sourceId: source.id, jobsFetched, jobsInserted, jobsUpdated, jobsRejected, status },
    'source sync completed',
  );

  return { sourceId: source.id, status, jobsFetched, jobsInserted, jobsUpdated, jobsRejected, errorMessage };
}

export async function syncAllDueSources(logger: SyncLogger = consoleLogger(), sourceId?: string) {
  const now = new Date();
  const sources = await prisma.jobSource.findMany({
    where: sourceId ? { id: sourceId } : { enabled: true },
    orderBy: [{ priority: 'asc' }, { companyName: 'asc' }],
  });

  const results: SourceSyncResult[] = [];
  for (const source of sources) {
    if (sourceId || !source.lastCrawledAt) {
      results.push(await syncSource(source, logger));
      continue;
    }
    const dueAt = source.lastCrawledAt.getTime() + source.crawlFrequencyMinutes * 60_000;
    if (now.getTime() >= dueAt) {
      results.push(await syncSource(source, logger));
    }
  }
  return results;
}
