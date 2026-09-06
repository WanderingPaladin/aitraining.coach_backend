import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { corsOriginOption } from './config.js';
import { serializeError } from './lib/http.js';
import { adminRoutes } from './modules/admin/routes.js';
import { accountRoutes } from './modules/account/routes.js';
import { applicationRoutes } from './modules/applications/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { slotRoutes } from './modules/availability/routes.js';
import { bookingRoutes } from './modules/bookings/routes.js';
import { internalJobRoutes } from './modules/jobs/internal-routes.js';
import { jobRoutes } from './modules/jobs/routes.js';
import { feedbackRoutes } from './modules/feedback/routes.js';
import { opportunityRoutes } from './modules/opportunities/routes.js';
import { trackingRoutes } from './modules/tracking/routes.js';

declare module 'fastify' {
  interface FastifyRequest {
    admin?: { name: string };
  }

  interface FastifyContextConfig {
    public?: boolean;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet);
  await app.register(cors, { origin: corsOriginOption, credentials: true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, request, reply) => {
    const serialized = serializeError(error);
    if (serialized.statusCode >= 500) {
      request.log.error(error);
    } else {
      request.log.info(
        { err: error, statusCode: serialized.statusCode },
        error instanceof Error ? error.message : 'request failed',
      );
    }
    return reply.code(serialized.statusCode).send(serialized.body);
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(applicationRoutes, { prefix: '/v1' });
  await app.register(trackingRoutes, { prefix: '/v1' });
  await app.register(feedbackRoutes, { prefix: '/v1' });
  await app.register(slotRoutes, { prefix: '/v1' });
  await app.register(bookingRoutes, { prefix: '/v1' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(accountRoutes, { prefix: '/v1/account' });
  await app.register(opportunityRoutes, { prefix: '/v1/opportunities' });
  await app.register(jobRoutes, { prefix: '/v1/jobs' });
  await app.register(internalJobRoutes, { prefix: '/v1/internal' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });

  return app;
}
