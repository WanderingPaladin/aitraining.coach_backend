import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config.js';
import { runJobSyncCycle } from './run.js';
import type { SyncLogger } from './types.js';

function asSyncLogger(log: FastifyBaseLogger): SyncLogger {
  return {
    info: (obj, msg) => log.info(obj, msg),
    warn: (obj, msg) => log.warn(obj, msg),
    error: (obj, msg) => log.error(obj, msg),
  };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startJobSyncScheduler(log: FastifyBaseLogger): void {
  if (!config.JOB_SYNC_ENABLED || config.NODE_ENV === 'test') {
    log.info('job sync scheduler disabled');
    return;
  }
  const intervalMs = config.JOB_SYNC_INTERVAL_MINUTES * 60_000;
  const logger = asSyncLogger(log);

  const tick = async () => {
    if (running) {
      log.warn('job sync tick skipped; previous cycle still running');
      return;
    }
    running = true;
    try {
      await runJobSyncCycle(logger);
    } catch (error) {
      log.error({ err: error }, 'job sync cycle failed');
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();
  log.info({ intervalMinutes: config.JOB_SYNC_INTERVAL_MINUTES }, 'job sync scheduler started');
}

export function stopJobSyncScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
