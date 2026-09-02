import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { toMatchProfile } from '../account/service.js';
import { readSessionUser, requireUser } from '../auth/session.js';
import { listOpportunitiesQuery, opportunityIdParams } from './schema.js';
import {
  listOpportunities,
  listSavedOpportunities,
  saveOpportunity,
  unsaveOpportunity,
} from './service.js';

export const opportunityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/saved', async (request) => {
    const session = await requireUser(request);
    const profile = await prisma.profile.findUnique({ where: { userId: session.id } });
    const opportunities = await listSavedOpportunities(
      session.id,
      profile ? toMatchProfile(profile) : null,
    );
    return { opportunities };
  });

  fastify.get('/', { config: { public: true } }, async (request) => {
    const query = listOpportunitiesQuery.parse(request.query);
    const session = await readSessionUser(request);
    const profile = session
      ? await prisma.profile.findUnique({ where: { userId: session.id } })
      : null;
    return listOpportunities({
      ...query,
      userId: session?.id,
      matchProfile: profile ? toMatchProfile(profile) : null,
    });
  });

  fastify.post('/:id/save', async (request) => {
    const session = await requireUser(request);
    const params = opportunityIdParams.parse(request.params);
    const opportunity = await saveOpportunity(session.id, params.id);
    return { opportunity };
  });

  fastify.delete('/:id/save', async (request) => {
    const session = await requireUser(request);
    const params = opportunityIdParams.parse(request.params);
    await unsaveOpportunity(session.id, params.id);
    return { ok: true };
  });
};
