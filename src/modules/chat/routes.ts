import type { FastifyPluginAsync } from 'fastify';
import { readSessionUser } from '../auth/session.js';
import { isTeamOnline } from './realtime.js';
import {
  contactEmailBody,
  conversationIdParams,
  listMessagesQuery,
  openedBody,
  sendChatMessageBody,
  socketTokenBody,
  visitorChatQuery,
} from './schema.js';
import {
  getVisitorChat,
  listVisitorMessages,
  markVisitorRead,
  recordChatOpened,
  sendVisitorMessage,
  setContactEmail,
  visitorUnread,
} from './service.js';
import { issueChatToken } from './token.js';

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/chat', { config: { public: true } }, async (request) => {
    const query = visitorChatQuery.parse(request.query);
    const session = await readSessionUser(request);
    const result = await getVisitorChat({ visitorId: query.visitorId, userId: session?.id ?? null });
    return { ...result, teamOnline: isTeamOnline() };
  });

  fastify.get('/chat/unread', { config: { public: true } }, async (request) => {
    const query = visitorChatQuery.parse(request.query);
    const session = await readSessionUser(request);
    const result = await visitorUnread({ visitorId: query.visitorId, userId: session?.id ?? null });
    return { ...result, teamOnline: isTeamOnline() };
  });

  fastify.get('/chat/presence', { config: { public: true } }, async () => ({ teamOnline: isTeamOnline() }));

  fastify.post('/chat/socket-token', { config: { public: true, rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const body = socketTokenBody.parse(request.body ?? {});
    const session = await readSessionUser(request);
    if (session?.id) {
      return { token: issueChatToken({ role: 'visitor', visitorId: body.visitorId || session.id }) };
    }
    return { token: issueChatToken({ role: 'visitor', visitorId: body.visitorId || 'anonymous' }) };
  });

  fastify.post('/chat/messages', { config: { public: true, rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = sendChatMessageBody.parse(request.body);
    const session = await readSessionUser(request);
    const result = await sendVisitorMessage({ ...body, userId: session?.id ?? null });
    const { emitChatEvent } = await import('./realtime.js');
    emitChatEvent(result.conversation.id, 'message:new', result);
    emitChatEvent('team', 'inbox:update', { conversation: result.conversation });
    const { notifyTeamNewMessage } = await import('./notify.js');
    void notifyTeamNewMessage(result.conversation, result.message);
    return reply.code(201).send({ ...result, teamOnline: isTeamOnline() });
  });

  fastify.get('/chat/conversations/:id/messages', { config: { public: true } }, async (request) => {
    const params = conversationIdParams.parse(request.params);
    const query = listMessagesQuery.parse(request.query);
    const session = await readSessionUser(request);
    return listVisitorMessages(params.id, {
      visitorId: query.visitorId,
      userId: session?.id ?? null,
      before: query.before,
      limit: query.limit,
    });
  });

  fastify.post('/chat/conversations/:id/read', { config: { public: true } }, async (request) => {
    const params = conversationIdParams.parse(request.params);
    const body = visitorChatQuery.parse(request.body ?? {});
    const session = await readSessionUser(request);
    return markVisitorRead(params.id, { visitorId: body.visitorId, userId: session?.id ?? null });
  });

  fastify.post('/chat/conversations/:id/contact-email', { config: { public: true } }, async (request) => {
    const params = conversationIdParams.parse(request.params);
    const body = contactEmailBody.parse(request.body);
    const session = await readSessionUser(request);
    return setContactEmail(params.id, { visitorId: body.visitorId, userId: session?.id ?? null, email: body.email });
  });

  fastify.post('/chat/opened', { config: { public: true } }, async (request) => {
    const body = openedBody.parse(request.body ?? {});
    const session = await readSessionUser(request);
    await recordChatOpened({ visitorId: body.visitorId, sessionId: body.sessionId, userId: session?.id ?? null });
    return { ok: true, teamOnline: isTeamOnline() };
  });
};
