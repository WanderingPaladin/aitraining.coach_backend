import type { FastifyPluginAsync } from 'fastify';
import { readSessionUser } from '../auth/session.js';
import { trackEventsBody, trackSessionBody } from './schema.js';
import { ingestPublicEvents, ingestSession } from './service.js';

export const trackingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/track/session',
    {
      config: {
        rateLimit: { max: 40, timeWindow: '1 minute' },
      },
    },
    async (request) => {
      const body = trackSessionBody.parse(request.body);
      const session = await readSessionUser(request);
      const result = await ingestSession(body, {
        userId: session?.id ?? null,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      });
      return result;
    },
  );

  fastify.post(
    '/track/events',
    {
      config: {
        rateLimit: { max: 60, timeWindow: '1 minute' },
      },
    },
    async (request) => {
      const body = trackEventsBody.parse(request.body);
      const session = await readSessionUser(request);
      return ingestPublicEvents(body, { userId: session?.id ?? null });
    },
  );
};
