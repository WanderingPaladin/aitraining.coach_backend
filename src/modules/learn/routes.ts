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
  retryCertificate,
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
    const { ATTEMPT_QUESTION_COUNT, ATTEMPT_PRACTICAL_COUNT } = await import('./questions.js');
    return { count: ATTEMPT_QUESTION_COUNT + ATTEMPT_PRACTICAL_COUNT };
  });

  fastify.post(
    '/learn/assessment/attempts',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = startAttemptBody.parse(request.body);
      const user = await readSessionUser(request);
      try {
        const result = await startAttempt({ userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body);
        request.log.info(
          {
            op: 'assessment_start',
            userId: user?.id ?? null,
            attemptId: result.attempt.id,
            submitted: result.attempt.submitted,
            questionCount: result.questions.length,
          },
          '[Assessment:start]',
        );
        return reply.code(result.attempt.submitted ? 200 : 201).send(result);
      } catch (error) {
        request.log.error({ op: 'assessment_start', userId: user?.id ?? null, err: error }, '[Assessment:start]');
        throw error;
      }
    },
  );

  fastify.put(
    '/learn/assessment/attempts/:id',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const params = request.params as { id: string };
      const body = saveAnswersBody.parse(request.body);
      const user = await readSessionUser(request);
      try {
        const result = await saveAnswers(params.id, { userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body);
        request.log.info({ op: 'assessment_answer', userId: user?.id ?? null, attemptId: params.id }, '[Assessment:answer]');
        return result;
      } catch (error) {
        request.log.error({ op: 'assessment_answer', userId: user?.id ?? null, attemptId: params.id, err: error }, '[Assessment:answer]');
        throw error;
      }
    },
  );

  fastify.post(
    '/learn/assessment/attempts/:id/submit',
    { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } },
    async (request) => {
      const params = request.params as { id: string };
      const body = submitAttemptBody.parse(request.body);
      const user = await readSessionUser(request);
      try {
        const result = await submitAttempt(params.id, { userId: user?.id ?? null, visitorId: body.visitorId ?? null }, body);
        request.log.info(
          {
            op: 'assessment_submit',
            userId: user?.id ?? null,
            attemptId: params.id,
            submitted: result.submitted,
            passed: result.passed,
            hasCertificate: Boolean(result.certificate),
          },
          '[Assessment:submit]',
        );
        return result;
      } catch (error) {
        request.log.error({ op: 'assessment_submit', userId: user?.id ?? null, attemptId: params.id, err: error }, '[Assessment:submit]');
        throw error;
      }
    },
  );

  fastify.post(
    '/learn/assessment/attempts/:id/certificate',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request) => {
      const params = request.params as { id: string };
      const raw = request.body && typeof request.body === 'object' ? request.body : {};
      const body = attemptQuery.parse({ ...(raw as object), ...(request.query as object) });
      const user = await readSessionUser(request);
      try {
        const result = await retryCertificate(params.id, { userId: user?.id ?? null, visitorId: body.visitorId ?? null });
        request.log.info(
          { op: 'assessment_certificate', userId: user?.id ?? null, attemptId: params.id, hasCertificate: Boolean(result.certificate) },
          '[Assessment:certificate]',
        );
        return result;
      } catch (error) {
        request.log.error({ op: 'assessment_certificate', userId: user?.id ?? null, attemptId: params.id, err: error }, '[Assessment:certificate]');
        throw error;
      }
    },
  );

  fastify.get('/learn/assessment/attempts/:id', async (request) => {
    const params = request.params as { id: string };
    const query = attemptQuery.parse(request.query);
    const user = await readSessionUser(request);
    try {
      const result = await getAttemptResult(params.id, { userId: user?.id ?? null, visitorId: query.visitorId ?? null });
      request.log.info(
        { op: 'assessment_load', userId: user?.id ?? null, attemptId: params.id, submitted: result.submitted },
        '[Assessment:load]',
      );
      return result;
    } catch (error) {
      request.log.error({ op: 'assessment_load', userId: user?.id ?? null, attemptId: params.id, err: error }, '[Assessment:load]');
      throw error;
    }
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
