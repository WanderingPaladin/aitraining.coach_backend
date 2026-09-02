import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { runJobSyncCycle } from '../src/modules/job-collector/run.js';

const sourceId = process.argv[2];

const result = await runJobSyncCycle(
  {
    info: (obj, msg) => console.info(msg, obj),
    warn: (obj, msg) => console.warn(msg, obj),
    error: (obj, msg) => console.error(msg, obj),
  },
  sourceId,
);

console.info(JSON.stringify(result, null, 2));
await prisma.$disconnect();
