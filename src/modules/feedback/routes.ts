import type { FastifyPluginAsync } from 'fastify';
import { readSessionUser } from '../auth/session.js';
import { createFeedbackBody } from './schema.js';
import { createFeedback, serializeFeedback } from './service.js';

export const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/feedback',
    {
      config: {
        rateLimit: { max: 8, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = createFeedbackBody.parse(request.body);
      const session = await readSessionUser(request);
      const feedback = await createFeedback(body, {
        userId: session?.id ?? null,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      });
      return reply.code(201).send({ feedback: serializeFeedback(feedback) });
    },
  );
};
