import type { FastifyPluginAsync } from 'fastify';
import { SOURCE_IDENTIFIER_HELP } from '../job-collector/sources/registry.js';
import { runJobSyncCycle } from '../job-collector/run.js';
import {
  createJobSource,
  getJobSource,
  listAdminJobs,
  listJobSources,
  setJobActive,
  updateJobSource,
} from './admin-service.js';
import { jobIdParams, jobSourceIdParams, listAdminJobsQuery, patchJobBody, patchJobSourceBody, upsertJobSourceBody } from './schema.js';

export const jobAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/job-sources', async () => {
    const sources = await listJobSources();
    return { sources, identifierHelp: SOURCE_IDENTIFIER_HELP };
  });

  fastify.get('/job-sources/:id', async (request) => {
    const params = jobSourceIdParams.parse(request.params);
    return getJobSource(params.id);
  });

  fastify.post('/job-sources', async (request, reply) => {
    const body = upsertJobSourceBody.parse(request.body);
    const source = await createJobSource(body);
    return reply.code(201).send({ source });
  });

  fastify.patch('/job-sources/:id', async (request) => {
    const params = jobSourceIdParams.parse(request.params);
    const body = patchJobSourceBody.parse(request.body);
    const source = await updateJobSource(params.id, body);
    return { source };
  });

  fastify.post('/job-sources/:id/sync', async (request) => {
    const params = jobSourceIdParams.parse(request.params);
    const cycle = await runJobSyncCycle(request.log, params.id);
    return {
      locked: cycle.locked,
      staleMarked: cycle.staleMarked,
      results: cycle.results,
    };
  });

  fastify.get('/jobs', async (request) => {
    const query = listAdminJobsQuery.parse(request.query);
    return listAdminJobs(query);
  });

  fastify.patch('/jobs/:id', async (request) => {
    const params = jobIdParams.parse(request.params);
    const body = patchJobBody.parse(request.body);
    const job = await setJobActive(params.id, body.isActive);
    return { job };
  });
};
