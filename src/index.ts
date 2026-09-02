import { buildApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db/prisma.js';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  const { startJobSyncScheduler } = await import('./modules/job-collector/scheduler.js');
  startJobSyncScheduler(app.log);
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
