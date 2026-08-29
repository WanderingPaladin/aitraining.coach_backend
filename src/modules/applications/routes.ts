import type { FastifyPluginAsync } from 'fastify';
import { createApplicationBody } from './schema.js';
import { createOrUpdateApplication, serializeApplication } from './service.js';

export const applicationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/applications',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = createApplicationBody.parse(request.body);
      const { application, created } = await createOrUpdateApplication({
        ...body,
        requestIp: request.ip,
      });
      return reply.code(created ? 201 : 200).send({
        application: serializeApplication(application),
      });
    },
  );
};
