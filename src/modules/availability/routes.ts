import type { FastifyPluginAsync } from 'fastify';
import { slotsQuery } from './schema.js';
import { listOpenSlots } from './service.js';

export const slotRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/slots', async (request) => {
    const query = slotsQuery.parse(request.query);
    const slots = await listOpenSlots(query);
    return { slots };
  });
};
