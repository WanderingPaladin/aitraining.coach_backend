import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { discoverJobSources } from '../src/modules/job-collector/discover.js';
import { runJobSyncCycle } from '../src/modules/job-collector/run.js';

const logger = {
  info: (obj: unknown, msg: string) => console.info(msg, obj),
  warn: (obj: unknown, msg: string) => console.warn(msg, obj),
  error: (obj: unknown, msg: string) => console.error(msg, obj),
};

const discovery = await discoverJobSources(logger);
console.info(JSON.stringify({ discovery: { ...discovery, boards: discovery.boards.length } }, null, 2));

if (discovery.sourcesCreated + discovery.sourcesUpdated > 0) {
  const sync = await runJobSyncCycle(logger);
  const inserted = sync.results.reduce((sum, item) => sum + item.jobsInserted, 0);
  const updated = sync.results.reduce((sum, item) => sum + item.jobsUpdated, 0);
  const fetched = sync.results.reduce((sum, item) => sum + item.jobsFetched, 0);
  console.info(JSON.stringify({ sync: { locked: sync.locked, staleMarked: sync.staleMarked, fetched, inserted, updated, sources: sync.results.length } }, null, 2));
}

await prisma.$disconnect();
