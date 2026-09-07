import type { FastifyPluginAsync } from 'fastify';
import { readSessionUser } from '../auth/session.js';
import { issueChatSocketToken } from './token.js';
import {
  chatContactEmailBody,
  chatIdParams,
  chatReadBody,
  chatSocketTokenBody,
  createChatMessageBody,
  getChatQuery,
  listChatMessagesQuery,
} from './schema.js';
import {
  getPublicChat,
  listMessages,
  markPublicRead,
  publicUnreadCount,
  saveContactEmail,
  sendPublicMessage,
  assertConversationAccess,
} from './service.js';
import { isTeamOnline } from './realtime.js';
import { recordEvent } from '../tracking/events.js';

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/chat', async (request) => {
    const query = getChatQuery.parse(request.query);
    const session = await readSessionUser(request);
    return getPublicChat({ visitorId: query.visitorId, userId: session?.id ?? null });
  });

  fastify.get('/chat/unread', async (request) => {
    const query = getChatQuery.parse(request.query);
    const session = await readSessionUser(request);
    return publicUnreadCount({ visitorId: query.visitorId, userId: session?.id ?? null });
  });

  fastify.get('/chat/presence', async () => ({ teamOnline: isTeamOnline() }));

  fastify.post(
    '/chat/socket-token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = chatSocketTokenBody.parse(request.body ?? {});
      const session = await readSessionUser(request);
      if (session) {
        return {
          token: issueChatSocketToken({
            role: 'user',
            userId: session.id,
            visitorId: body.visitorId,
          }),
        };
      }
      if (!body.visitorId) {
        return reply.code(400).send({
          error: { code: 'CHAT_IDENTITY_REQUIRED', message: 'A visitor id is required.' },
        });
      }
      return {
        token: issueChatSocketToken({
          role: 'visitor',
          visitorId: body.visitorId,
        }),
      };
    },
  );

  fastify.post(
    '/chat/messages',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = createChatMessageBody.parse(request.body);
      if (body.companyWebsite) {
        return reply.code(201).send({ discarded: true });
      }
      const session = await readSessionUser(request);
      const result = await sendPublicMessage(body, { userId: session?.id ?? null });
      if ('discarded' in result) {
        return reply.code(201).send({ discarded: true });
      }
      return reply.code(201).send(result);
    },
  );

  fastify.get('/chat/conversations/:id/messages', async (request) => {
    const params = chatIdParams.parse(request.params);
    const query = listChatMessagesQuery.parse(request.query);
    const session = await readSessionUser(request);
    await assertConversationAccess(params.id, {
      visitorId: query.visitorId,
      userId: session?.id ?? null,
    });
    return listMessages(params.id, { before: query.before, limit: query.limit, unreadFor: 'visitor' });
  });

  fastify.post('/chat/conversations/:id/read', async (request) => {
    const params = chatIdParams.parse(request.params);
    const body = chatReadBody.parse(request.body ?? {});
    const session = await readSessionUser(request);
    return markPublicRead(params.id, { visitorId: body.visitorId, userId: session?.id ?? null });
  });

  fastify.post('/chat/conversations/:id/contact-email', async (request) => {
    const params = chatIdParams.parse(request.params);
    const body = chatContactEmailBody.parse(request.body);
    const session = await readSessionUser(request);
    return {
      conversation: await saveContactEmail(params.id, body.email, {
        visitorId: body.visitorId,
        userId: session?.id ?? null,
      }),
    };
  });

  fastify.post('/chat/opened', async (request) => {
    const query = getChatQuery.parse(request.body ?? request.query);
    const session = await readSessionUser(request);
    if (query.visitorId || session?.id) {
      await recordEvent({
        eventType: 'chat_opened',
        visitorId: query.visitorId ?? null,
        userId: session?.id ?? null,
        sessionId: query.sessionId ?? null,
        createdBy: 'candidate',
        idempotencyKey: `chat_opened:${query.sessionId ?? session?.id ?? query.visitorId}`,
      });
    }
    return { ok: true, teamOnline: isTeamOnline() };
  });
};
