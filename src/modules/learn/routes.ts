import type { FastifyPluginAsync } from 'fastify';
import { readSessionUser } from '../auth/session.js';
import {
  attemptQuery,
  progressBody,
  progressQuery,
  saveAnswersBody,
  startAttemptBody,
  submitAttemptBody,
} from './schema.js';
import {
  getAttemptResult,
  getCertificatePdf,
  getProgress,
  getPublicCertificate,
  saveAnswers,
  saveProgress,
  startAttempt,
  submitAttempt,
} from './service.js';

export const learnRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/learn/progress', async (request) => {
    const query = progressQuery.parse(request.query);
    const user = await readSessionUser(request);
    return {
      progress: await getProgress({ userId: user?.id ?? null, visitorId: query.visitorId ?? null }, query.courseSlug),
    };
  });

  fastify.put(
    '/learn/progress',
    { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } },
    async (request) => {
      const body = progressBody.parse(request.body);
      const user = await readSessionUser(request);
      return {
        progress: await saveProgress({ userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body),
      };
    },
  );

  fastify.get('/learn/assessment/questions', async () => {
    const { publicQuestions } = await import('./questions.js');
    return { questions: publicQuestions() };
  });

  fastify.post(
    '/learn/assessment/attempts',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = startAttemptBody.parse(request.body);
      const user = await readSessionUser(request);
      const result = await startAttempt({ userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body);
      return reply.code(201).send(result);
    },
  );

  fastify.put(
    '/learn/assessment/attempts/:id',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const params = request.params as { id: string };
      const body = saveAnswersBody.parse(request.body);
      const user = await readSessionUser(request);
      return saveAnswers(params.id, { userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body);
    },
  );

  fastify.post(
    '/learn/assessment/attempts/:id/submit',
    { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } },
    async (request) => {
      const params = request.params as { id: string };
      const body = submitAttemptBody.parse(request.body);
      const user = await readSessionUser(request);
      return submitAttempt(params.id, { userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body);
    },
  );

  fastify.get('/learn/assessment/attempts/:id', async (request) => {
    const params = request.params as { id: string };
    const query = attemptQuery.parse(request.query);
    const user = await readSessionUser(request);
    return getAttemptResult(params.id, { userId: user?.id ?? null, visitorId: query.visitorId ?? null });
  });

  fastify.get('/learn/certificates/:credentialId', async (request) => {
    const params = request.params as { credentialId: string };
    return { certificate: await getPublicCertificate(params.credentialId) };
  });

  fastify.get('/learn/certificates/:credentialId/pdf', async (request, reply) => {
    const params = request.params as { credentialId: string };
    const { pdf, filename } = await getCertificatePdf(params.credentialId);
    return reply
      .type('application/pdf')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(pdf);
  });
};
