import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { jobSyncSecret } from '../../config.js';
import { unauthorized } from '../../lib/errors.js';
import { runJobSyncCycle } from '../job-collector/run.js';

function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) {
    return false;
  }
  const token = header.slice('Bearer '.length);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(tokenBuffer, expectedBuffer);
}

export const internalJobRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/jobs/sync',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request) => {
      if (!bearerMatches(request.headers.authorization, jobSyncSecret())) {
        throw unauthorized('Invalid job sync credentials');
      }
      const cycle = await runJobSyncCycle(request.log);
      return {
        locked: cycle.locked,
        staleMarked: cycle.staleMarked,
        results: cycle.results,
      };
    },
  );
};
