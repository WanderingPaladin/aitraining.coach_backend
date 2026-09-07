import type { ChatConversation, ChatMessage, ChatStatus, Feedback, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { isUuid } from '../tracking/sanitize.js';
import { recordEvent } from '../tracking/events.js';
import { areaLabel } from '../feedback/service.js';
import type { SendChatMessageBody } from './schema.js';

const OPEN_STATUSES: ChatStatus[] = ['open', 'waiting_for_team', 'waiting_for_user'];

const conversationInclude = {
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      feedback: {
        select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true },
      },
    },
  },
} satisfies Prisma.ChatConversationInclude;

type ConversationRecord = Prisma.ChatConversationGetPayload<{ include: typeof conversationInclude }>;
type MessageRecord = ChatMessage & {
  feedback?: {
    id: string;
    category: string;
    subcategory: string | null;
    message: string;
    rating: number | null;
    pagePath?: string;
  } | null;
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function feedbackSummary(feedback: Pick<Feedback, 'category' | 'subcategory' | 'message' | 'pagePath'>) {
  const area = areaLabel(feedback.pagePath || '/', feedback.category, feedback.subcategory);
  const text = stripHtml(feedback.message).slice(0, 160);
  return text ? `${area}: ${text}` : area;
}

export function serializeMessage(message: MessageRecord, viewer: 'visitor' | 'admin' = 'visitor') {
  const team = message.senderType === 'team' || message.senderType === 'system';
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    senderLabel: team ? 'AI Trainers Team' : viewer === 'admin' ? message.senderLabel || 'Visitor' : 'You',
    body: message.body,
    messageType: message.messageType,
    feedbackId: message.feedbackId,
    feedback: message.feedback
      ? {
          id: message.feedback.id,
          category: message.feedback.category,
          subcategory: message.feedback.subcategory,
          message: message.feedback.message,
          rating: message.feedback.rating,
          areaLabel: areaLabel(message.feedback.pagePath || '/', message.feedback.category, message.feedback.subcategory),
        }
      : null,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt ? message.readAt.toISOString() : null,
  };
}

export function serializeConversation(
  conversation: ConversationRecord | (ChatConversation & { messages?: MessageRecord[] }),
  extras?: { unreadCount?: number; viewer?: 'visitor' | 'admin' },
) {
  const last = conversation.messages?.[0] ?? null;
  return {
    id: conversation.id,
    status: conversation.status,
    topic: conversation.topic,
    topicLabel: conversation.topicLabel,
    visitorId: conversation.visitorId,
    sessionId: conversation.sessionId,
    userId: conversation.userId,
    applicationId: conversation.applicationId,
    assignedTo: conversation.assignedTo,
    startedFromPage: conversation.startedFromPage,
    startedFromUrl: conversation.startedFromUrl,
    firstSource: conversation.firstSource,
    firstUtmSource: conversation.firstUtmSource,
    firstUtmCampaign: conversation.firstUtmCampaign,
    currentFunnelStage: conversation.currentFunnelStage,
    contextType: conversation.contextType,
    opportunityId: conversation.opportunityId,
    opportunityTitle: conversation.opportunityTitle,
    opportunityPlatform: conversation.opportunityPlatform,
    contactEmail: conversation.contactEmail,
    displayName: conversation.displayName,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    closedAt: conversation.closedAt ? conversation.closedAt.toISOString() : null,
    lastMessage: last ? serializeMessage(last, extras?.viewer ?? 'visitor') : null,
    unreadCount: extras?.unreadCount ?? 0,
  };
}

async function unreadFor(conversationId: string, viewer: 'visitor' | 'admin') {
  return prisma.chatMessage.count({
    where: {
      conversationId,
      readAt: null,
      senderType: viewer === 'admin' ? { in: ['visitor', 'candidate'] } : 'team',
    },
  });
}

export async function findOpenConversation(input: {
  visitorId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
}) {
  if (input.conversationId) {
    const existing = await prisma.chatConversation.findUnique({ where: { id: input.conversationId } });
    if (existing && OPEN_STATUSES.includes(existing.status)) return existing;
  }
  const or: Prisma.ChatConversationWhereInput[] = [
    ...(input.visitorId ? [{ visitorId: input.visitorId }] : []),
    ...(input.userId ? [{ userId: input.userId }] : []),
  ];
  if (!or.length) return null;
  return prisma.chatConversation.findFirst({
    where: { OR: or, status: { in: OPEN_STATUSES } },
    orderBy: { lastMessageAt: 'desc' },
  });
}

async function resolveActor(input: {
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
}) {
  const visitorId = isUuid(input.visitorId) ? input.visitorId : null;
  const sessionId = isUuid(input.sessionId) ? input.sessionId : null;
  const visitor = visitorId
    ? await prisma.visitor.findUnique({
        where: { id: visitorId },
        select: { id: true, userId: true, firstSource: true, utmSource: true, utmCampaign: true },
      })
    : null;
  const userId = input.userId ?? visitor?.userId ?? null;
  const or: Prisma.ApplicationWhereInput[] = [
    ...(visitor ? [{ visitorId: visitor.id }] : []),
    ...(userId ? [{ userId }] : []),
  ];
  const application = or.length
    ? await prisma.application.findFirst({
        where: { OR: or },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          journeyStage: true,
          profession: true,
          city: true,
          state: true,
        },
      })
    : null;
  const displayName = application
    ? [application.firstName, application.lastName].filter(Boolean).join(' ') || 'Candidate'
    : 'Anonymous visitor';
  return { visitor, visitorId: visitor?.id ?? null, sessionId, userId, application, displayName };
}

export async function getVisitorChat(input: { visitorId?: string | null; userId?: string | null }) {
  const actor = await resolveActor(input);
  const conversation = await findOpenConversation({
    visitorId: actor.visitorId,
    userId: actor.userId,
  });
  if (!conversation) {
    return { conversation: null, messages: [], unreadCount: 0, hasMore: false };
  }
  const [messages, unreadCount, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    unreadFor(conversation.id, 'visitor'),
    prisma.chatMessage.count({ where: { conversationId: conversation.id } }),
  ]);
  const withLast = { ...conversation, messages: messages.slice(0, 1) };
  return {
    conversation: serializeConversation(withLast, { unreadCount, viewer: 'visitor' }),
    messages: messages.reverse().map((item) => serializeMessage(item, 'visitor')),
    unreadCount,
    hasMore: total > messages.length,
  };
}

export async function listVisitorMessages(id: string, input: { visitorId?: string | null; userId?: string | null; before?: string | null; limit: number }) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  assertVisitorAccess(conversation, input);
  const before = input.before
    ? await prisma.chatMessage.findUnique({ where: { id: input.before }, select: { createdAt: true } })
    : null;
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: id,
      ...(before ? { createdAt: { lt: before.createdAt } } : {}),
    },
    include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
    orderBy: { createdAt: 'desc' },
    take: input.limit,
  });
  const remaining = await prisma.chatMessage.count({
    where: {
      conversationId: id,
      ...(messages.length ? { createdAt: { lt: messages.at(-1)!.createdAt } } : {}),
    },
  });
  return {
    messages: messages.reverse().map((item) => serializeMessage(item, 'visitor')),
    hasMore: remaining > 0,
    unreadCount: await unreadFor(id, 'visitor'),
  };
}

function assertVisitorAccess(
  conversation: ChatConversation,
  input: { visitorId?: string | null; userId?: string | null },
) {
  const visitorId = isUuid(input.visitorId) ? input.visitorId : null;
  if (input.userId && conversation.userId === input.userId) return;
  if (visitorId && conversation.visitorId === visitorId) return;
  throw forbidden('You cannot access that conversation');
}

async function ensureConversation(input: {
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  pagePath?: string | null;
  pageUrl?: string | null;
  topic?: string | null;
  conversationId?: string | null;
}) {
  const actor = await resolveActor(input);
  const existing = await findOpenConversation({
    visitorId: actor.visitorId,
    userId: actor.userId,
    conversationId: input.conversationId,
  });
  if (existing) {
    if (input.conversationId && existing.id !== input.conversationId) {
      throw forbidden('You cannot access that conversation');
    }
    return { conversation: existing, actor, created: false };
  }
  const conversation = await prisma.chatConversation.create({
    data: {
      status: 'waiting_for_team',
      visitorId: actor.visitorId,
      sessionId: actor.sessionId,
      userId: actor.userId,
      applicationId: actor.application?.id ?? null,
      startedFromPage: input.pagePath || '/',
      startedFromUrl: input.pageUrl || null,
      firstSource: actor.visitor?.firstSource ?? 'direct',
      firstUtmSource: actor.visitor?.utmSource ?? null,
      firstUtmCampaign: actor.visitor?.utmCampaign ?? null,
      currentFunnelStage: actor.application?.journeyStage ?? 'visitor',
      topic: input.topic ?? null,
      displayName: actor.displayName,
      contactEmail: actor.application?.email ?? null,
    },
  });
  await recordEvent({
    eventType: 'chat_started',
    visitorId: actor.visitorId,
    applicationId: actor.application?.id ?? null,
    userId: actor.userId,
    sessionId: actor.sessionId,
    pagePath: input.pagePath || '/',
    createdBy: 'candidate',
    idempotencyKey: `chat_started:${conversation.id}`,
    metadata: { conversation_id: conversation.id, topic: input.topic ?? null },
  });
  return { conversation, actor, created: true };
}

export async function sendVisitorMessage(input: SendChatMessageBody & { userId?: string | null }) {
  const body = stripHtml(input.body).slice(0, 2000);
  const { conversation, actor } = await ensureConversation(input);
  const now = new Date();
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderType: actor.userId ? 'candidate' : 'visitor',
      senderLabel: actor.displayName,
      body,
      messageType: 'text',
    },
    include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
  });
  const updated = await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { status: 'waiting_for_team', lastMessageAt: now, displayName: actor.displayName },
    include: conversationInclude,
  });
  return {
    conversation: serializeConversation(updated, {
      unreadCount: await unreadFor(conversation.id, 'admin'),
      viewer: 'visitor',
    }),
    message: serializeMessage(message, 'visitor'),
  };
}

export async function attachFeedbackToConversation(feedback: Feedback) {
  const { conversation, actor, created } = await ensureConversation({
    visitorId: feedback.visitorId,
    sessionId: feedback.sessionId,
    userId: feedback.userId,
    pagePath: feedback.pagePath,
    pageUrl: feedback.pageUrl || null,
  });
  const now = new Date();
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderType: actor.userId ? 'candidate' : 'visitor',
      senderLabel: actor.displayName,
      body: feedbackSummary(feedback),
      messageType: 'feedback',
      feedbackId: feedback.id,
    },
    include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
  });
  const updated = await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: {
      status: 'waiting_for_team',
      lastMessageAt: now,
      displayName: actor.displayName,
      contactEmail: conversation.contactEmail || feedback.email || actor.application?.email || null,
    },
    include: conversationInclude,
  });
  const linked = await prisma.feedback.update({
    where: { id: feedback.id },
    data: { conversationId: conversation.id },
  });
  return {
    feedback: linked,
    conversation: serializeConversation(updated, { unreadCount: await unreadFor(conversation.id, 'admin'), viewer: 'visitor' }),
    message: serializeMessage(message, 'visitor'),
    created,
  };
}

export async function markVisitorRead(id: string, input: { visitorId?: string | null; userId?: string | null }) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  assertVisitorAccess(conversation, input);
  await prisma.chatMessage.updateMany({
    where: { conversationId: id, senderType: 'team', readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function setContactEmail(id: string, input: { visitorId?: string | null; userId?: string | null; email: string }) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  assertVisitorAccess(conversation, input);
  const updated = await prisma.chatConversation.update({
    where: { id },
    data: { contactEmail: input.email },
  });
  if (conversation.visitorId) {
    await prisma.feedback.updateMany({
      where: { conversationId: id, email: null },
      data: { email: input.email },
    });
  }
  return { conversation: serializeConversation({ ...updated, messages: [] }, { viewer: 'visitor' }) };
}

export async function visitorUnread(input: { visitorId?: string | null; userId?: string | null }) {
  const conversation = await findOpenConversation(input);
  if (!conversation) return { unreadCount: 0, conversationId: null };
  return { unreadCount: await unreadFor(conversation.id, 'visitor'), conversationId: conversation.id };
}

export async function recordChatOpened(input: { visitorId?: string | null; sessionId?: string | null; userId?: string | null }) {
  const actor = await resolveActor(input);
  if (actor.visitorId) {
    await recordEvent({
      eventType: 'chat_opened',
      visitorId: actor.visitorId,
      applicationId: actor.application?.id ?? null,
      userId: actor.userId,
      sessionId: actor.sessionId,
      createdBy: 'candidate',
      idempotencyKey: `chat_opened:${actor.visitorId}:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  return { ok: true as const };
}

export async function listAdminConversations(query: { status?: string; q?: string; page: number; pageSize: number }) {
  const where: Prisma.ChatConversationWhereInput = {
    ...(query.status && query.status !== 'all' && query.status !== 'unread' ? { status: query.status as ChatStatus } : {}),
    ...(query.status === 'unread'
      ? { messages: { some: { readAt: null, senderType: { in: ['visitor', 'candidate'] } } } }
      : {}),
    ...(query.q
      ? {
          OR: [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { contactEmail: { contains: query.q, mode: 'insensitive' } },
            { id: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, unreadCount, items] = await Promise.all([
    prisma.chatConversation.count({ where }),
    prisma.chatMessage.count({ where: { readAt: null, senderType: { in: ['visitor', 'candidate'] } } }),
    prisma.chatConversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { lastMessageAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const serialized = await Promise.all(
    items.map(async (item) =>
      serializeConversation(item, { unreadCount: await unreadFor(item.id, 'admin'), viewer: 'admin' }),
    ),
  );
  return { total, unreadCount, page: query.page, pageSize: query.pageSize, items: serialized };
}

export async function getAdminConversation(id: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  const context = await conversationContext(conversation);
  return {
    conversation: {
      ...serializeConversation({ ...conversation, messages: messages.slice(0, 1) }, {
        unreadCount: await unreadFor(id, 'admin'),
        viewer: 'admin',
      }),
      context,
    },
    messages: messages.reverse().map((item) => serializeMessage(item, 'admin')),
    hasMore: (await prisma.chatMessage.count({ where: { conversationId: id } })) > messages.length,
  };
}

async function conversationContext(conversation: ChatConversation) {
  const application = conversation.applicationId
    ? await prisma.application.findUnique({
        where: { id: conversation.applicationId },
        include: { bookings: { orderBy: { startsAt: 'desc' }, take: 1 } },
      })
    : null;
  return {
    displayName: conversation.displayName,
    profession: application?.profession ?? null,
    location: application ? [application.city, application.state].filter(Boolean).join(', ') : null,
    email: conversation.contactEmail || application?.email || null,
    source: conversation.firstSource,
    journeyStage: application?.journeyStage ?? 'visitor',
    journeyLabel: application?.journeyStage ?? 'Visitor',
    applicationId: application?.id ?? null,
    applicationCreatedAt: application?.createdAt.toISOString() ?? null,
    introCall: application?.bookings[0]
      ? { id: application.bookings[0].id, startsAt: application.bookings[0].startsAt.toISOString(), attendance: application.bookings[0].attendance }
      : null,
    startedFromPage: conversation.startedFromPage,
    opportunityTitle: conversation.opportunityTitle,
    opportunityPlatform: conversation.opportunityPlatform,
  };
}

export async function listAdminMessages(id: string, before?: string | null) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  const beforeRow = before
    ? await prisma.chatMessage.findUnique({ where: { id: before }, select: { createdAt: true } })
    : null;
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: id,
      ...(beforeRow ? { createdAt: { lt: beforeRow.createdAt } } : {}),
    },
    include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return {
    messages: messages.reverse().map((item) => serializeMessage(item, 'admin')),
    hasMore: messages.length === 40,
    unreadCount: await unreadFor(id, 'admin'),
  };
}

export async function sendAdminReply(id: string, body: string, actorName: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  const text = stripHtml(body).slice(0, 2000);
  const now = new Date();
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: id,
      senderType: 'team',
      senderLabel: actorName || 'AI Trainers Team',
      body: text,
      messageType: 'text',
    },
    include: { feedback: { select: { id: true, category: true, subcategory: true, message: true, rating: true, pagePath: true } } },
  });
  const updated = await prisma.chatConversation.update({
    where: { id },
    data: { status: 'waiting_for_user', lastMessageAt: now },
    include: conversationInclude,
  });
  const attached = await prisma.feedback.findFirst({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (attached) {
    await recordEvent({
      eventType: 'team_replied_to_feedback',
      visitorId: conversation.visitorId,
      applicationId: conversation.applicationId,
      userId: conversation.userId,
      sessionId: conversation.sessionId,
      createdBy: 'system',
      idempotencyKey: `team_replied_to_feedback:${id}:${attached.id}`,
      metadata: { conversation_id: id, feedback_id: attached.id },
    });
  } else {
    await recordEvent({
      eventType: 'team_reply_received',
      visitorId: conversation.visitorId,
      applicationId: conversation.applicationId,
      userId: conversation.userId,
      sessionId: conversation.sessionId,
      createdBy: 'system',
      idempotencyKey: `team_reply_received:${message.id}`,
      metadata: { conversation_id: id, message_id: message.id },
    });
  }
  return {
    conversation: serializeConversation(updated, { unreadCount: 0, viewer: 'admin' }),
    message: serializeMessage(message, 'admin'),
  };
}

export async function markAdminRead(id: string) {
  await prisma.chatMessage.updateMany({
    where: { conversationId: id, senderType: { in: ['visitor', 'candidate'] }, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function patchConversationStatus(id: string, status: ChatStatus) {
  const conversation = await prisma.chatConversation.update({
    where: { id },
    data: { status, closedAt: status === 'closed' || status === 'resolved' ? new Date() : null },
    include: conversationInclude,
  }).catch(() => {
    throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  });
  if (status === 'resolved' || status === 'closed') {
    await recordEvent({
      eventType: 'chat_resolved',
      visitorId: conversation.visitorId,
      applicationId: conversation.applicationId,
      userId: conversation.userId,
      createdBy: 'system',
      idempotencyKey: `chat_resolved:${conversation.id}:${status}`,
      metadata: { conversation_id: conversation.id, status },
    });
  }
  return { conversation: serializeConversation(conversation, { viewer: 'admin' }) };
}

export async function adminUnread() {
  const unreadCount = await prisma.chatMessage.count({
    where: { readAt: null, senderType: { in: ['visitor', 'candidate'] } },
  });
  return { unreadCount };
}

export async function openConversationForFeedback(feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw notFound('FEEDBACK_NOT_FOUND', 'Feedback not found');
  if (feedback.status === 'spam' || feedback.status === 'archived') {
    throw badRequest('FEEDBACK_NOT_REPLYABLE', 'Conversation unavailable for spam or archived feedback.');
  }
  if (feedback.conversationId) {
    return getAdminConversation(feedback.conversationId);
  }
  if (!feedback.visitorId && !feedback.userId) {
    throw badRequest(
      'CONVERSATION_UNAVAILABLE',
      'Conversation unavailable for this older anonymous feedback.',
    );
  }
  const attached = await attachFeedbackToConversation(feedback);
  return getAdminConversation(attached.conversation.id);
}
