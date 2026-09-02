import type { FastifyPluginAsync } from 'fastify';
import { getPublicJob, listPublicJobSitemap, listPublicJobs } from './service.js';
import { jobSlugParams, listJobsQuery } from './schema.js';

export const jobRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request) => {
    const query = listJobsQuery.parse(request.query);
    return listPublicJobs(query);
  });

  fastify.get('/sitemap', async () => {
    const jobs = await listPublicJobSitemap();
    return { jobs };
  });

  fastify.get('/:slug', async (request) => {
    const params = jobSlugParams.parse(request.params);
    const job = await getPublicJob(params.slug);
    return { job };
  });
};
