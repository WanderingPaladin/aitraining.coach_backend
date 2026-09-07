import { issueChatToken } from './token.js';
import {
  adminReplyBody,
  conversationIdParams,
  listAdminConversationsQuery,
  listMessagesQuery,
  patchConversationBody,
} from './schema.js';
import {
  adminUnread,
  getAdminConversation,
  listAdminConversations,
  listAdminMessages,
  markAdminRead,
  patchConversationStatus,
  sendAdminReply,
} from './service.js';
import { isTeamOnline } from './realtime.js';
import { config } from '../../config.js';
import type { FastifyPluginAsync } from 'fastify';

export const chatAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/chat/unread', async () => {
    const result = await adminUnread();
    return { ...result, teamOnline: isTeamOnline() };
  });

  fastify.post('/chat/socket-token', async () => ({
    token: issueChatToken({ role: 'admin' }),
  }));

  fastify.get('/chat/conversations', async (request) => {
    const query = listAdminConversationsQuery.parse(request.query);
    return listAdminConversations(query);
  });

  fastify.get('/chat/conversations/:id', async (request) => {
    const params = conversationIdParams.parse(request.params);
    const result = await getAdminConversation(params.id);
    return { ...result, teamOnline: isTeamOnline() };
  });

  fastify.get('/chat/conversations/:id/messages', async (request) => {
    const params = conversationIdParams.parse(request.params);
    const query = listMessagesQuery.parse(request.query);
    return listAdminMessages(params.id, query.before);
  });

  fastify.post('/chat/conversations/:id/messages', async (request, reply) => {
    const params = conversationIdParams.parse(request.params);
    const body = adminReplyBody.parse(request.body);
    const result = await sendAdminReply(params.id, body.body, request.admin?.name ?? config.ADMIN_NAME);
    const { emitChatEvent } = await import('./realtime.js');
    emitChatEvent(result.conversation.id, 'message:new', result);
    emitChatEvent('team', 'inbox:update', { conversation: result.conversation });
    const { notifyVisitorReply } = await import('./notify.js');
    void notifyVisitorReply(result.conversation, result.message);
    return reply.code(201).send(result);
  });

  fastify.post('/chat/conversations/:id/read', async (request) => {
    const params = conversationIdParams.parse(request.params);
    return markAdminRead(params.id);
  });

  fastify.patch('/chat/conversations/:id', async (request) => {
    const params = conversationIdParams.parse(request.params);
    const body = patchConversationBody.parse(request.body);
    return patchConversationStatus(params.id, body.status);
  });
};
