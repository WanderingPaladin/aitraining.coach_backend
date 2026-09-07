import type { FastifyPluginAsync } from 'fastify';
import { feedbackIdParams, listFeedbackQuery, patchFeedbackBody } from './schema.js';
import { listFeedback, getFeedbackSummary, serializeFeedback, updateFeedbackStatus } from './service.js';
import { ensureConversationForFeedback } from '../chat/service.js';

export const feedbackAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/feedback/summary', async () => getFeedbackSummary());

  fastify.get('/feedback', async (request) => {
    const query = listFeedbackQuery.parse(request.query);
    const result = await listFeedback(query);
    return {
      ...result,
      items: result.items.map(serializeFeedback),
    };
  });

  fastify.patch('/feedback/:id', async (request) => {
    const params = feedbackIdParams.parse(request.params);
    const body = patchFeedbackBody.parse(request.body);
    const feedback = await updateFeedbackStatus(params.id, body.status);
    return { feedback: serializeFeedback(feedback) };
  });

  fastify.post('/feedback/:id/conversation', async (request) => {
    const params = feedbackIdParams.parse(request.params);
    return ensureConversationForFeedback(params.id);
  });
};
