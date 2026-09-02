import { markStaleJobs } from './cleanup.js';
import { withJobSyncLock } from './lock.js';
import { syncAllDueSources, type SourceSyncResult } from './sync.js';
import type { SyncLogger } from './types.js';

export type JobSyncCycleResult = {
  locked: boolean;
  staleMarked: number;
  results: SourceSyncResult[];
};

export async function runJobSyncCycle(logger: SyncLogger, sourceId?: string): Promise<JobSyncCycleResult> {
  const locked = await withJobSyncLock(async () => {
    const results = await syncAllDueSources(logger, sourceId);
    const staleMarked = await markStaleJobs(logger);
    return { results, staleMarked };
  });
  if (!locked.ok) {
    logger.warn({}, 'job sync skipped because another run is in progress');
    return { locked: true, staleMarked: 0, results: [] };
  }
  return { locked: false, staleMarked: locked.value.staleMarked, results: locked.value.results };
}
