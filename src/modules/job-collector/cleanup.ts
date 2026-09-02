import { prisma } from '../../db/prisma.js';
import { shouldMarkStale } from './dedupe.js';
import { STALE_AFTER_MS, type SyncLogger } from './types.js';

export async function markStaleJobs(logger?: SyncLogger, now = new Date()): Promise<number> {
  const sources = await prisma.jobSource.findMany({
    select: { id: true, lastSuccessAt: true },
  });
  let marked = 0;
  for (const source of sources) {
    const jobs = await prisma.job.findMany({
      where: { sourceId: source.id, isActive: true },
      select: { id: true, lastSeenAt: true, isActive: true },
    });
    const staleIds = jobs
      .filter((job) =>
        shouldMarkStale({
          isActive: job.isActive,
          lastSeenAt: job.lastSeenAt,
          sourceLastSuccessAt: source.lastSuccessAt,
          now,
          staleAfterMs: STALE_AFTER_MS,
        }),
      )
      .map((job) => job.id);
    if (staleIds.length === 0) {
      continue;
    }
    await prisma.job.updateMany({
      where: { id: { in: staleIds } },
      data: { isActive: false },
    });
    marked += staleIds.length;
    logger?.info({ sourceId: source.id, count: staleIds.length }, 'stale jobs marked inactive');
  }
  return marked;
}
