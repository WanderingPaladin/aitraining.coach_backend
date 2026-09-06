import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { toMatchProfile } from '../account/service.js';
import { readSessionUser } from '../auth/session.js';
import { getPublicJob, listPublicJobSitemap, listPublicJobs } from './service.js';
import { jobSlugParams, listJobsQuery } from './schema.js';

export const jobRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request) => {
    const query = listJobsQuery.parse(request.query);
    const session = await readSessionUser(request);
    const profile = session
      ? await prisma.profile.findUnique({ where: { userId: session.id } })
      : null;
    return listPublicJobs(query, {
      matchProfile: profile ? toMatchProfile(profile) : null,
    });
  });

  fastify.get('/sitemap', async () => {
    const jobs = await listPublicJobSitemap();
    return { jobs };
  });

  fastify.get('/:slug', async (request) => {
    const params = jobSlugParams.parse(request.params);
    const session = await readSessionUser(request);
    const profile = session
      ? await prisma.profile.findUnique({ where: { userId: session.id } })
      : null;
    const job = await getPublicJob(params.slug, {
      matchProfile: profile ? toMatchProfile(profile) : null,
    });
    return { job };
  });
};
