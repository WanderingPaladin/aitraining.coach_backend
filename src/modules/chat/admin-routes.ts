import type { FastifyPluginAsync } from 'fastify';
import { issueChatSocketToken } from './token.js';
import {
  adminChatMessageBody,
  chatIdParams,
  listChatMessagesQuery,
  listChatQuery,
  patchChatConversationBody,
} from './schema.js';
import {
  adminUnreadCount,
  getAdminConversation,
  listAdminConversations,
  listMessages,
  markAdminRead,
  sendAdminMessage,
  updateConversationStatus,
} from './service.js';

export const chatAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/chat/unread', async () => adminUnreadCount());

  fastify.post('/chat/socket-token', async () => ({
    token: issueChatSocketToken({ role: 'admin' }),
  }));

  fastify.get('/chat/conversations', async (request) => {
    const query = listChatQuery.parse(request.query);
    return listAdminConversations(query);
  });

  fastify.get('/chat/conversations/:id', async (request) => {
    const params = chatIdParams.parse(request.params);
    return getAdminConversation(params.id);
  });

  fastify.get('/chat/conversations/:id/messages', async (request) => {
    const params = chatIdParams.parse(request.params);
    const query = listChatMessagesQuery.parse(request.query);
    await getAdminConversation(params.id);
    return listMessages(params.id, { before: query.before, limit: query.limit, unreadFor: 'team' });
  });

  fastify.post('/chat/conversations/:id/messages', async (request, reply) => {
    const params = chatIdParams.parse(request.params);
    const body = adminChatMessageBody.parse(request.body);
    const result = await sendAdminMessage(params.id, body.body);
    return reply.code(201).send(result);
  });

  fastify.post('/chat/conversations/:id/read', async (request) => {
    const params = chatIdParams.parse(request.params);
    return markAdminRead(params.id);
  });

  fastify.patch('/chat/conversations/:id', async (request) => {
    const params = chatIdParams.parse(request.params);
    const body = patchChatConversationBody.parse(request.body);
    return updateConversationStatus(params.id, body.status);
  });
};
