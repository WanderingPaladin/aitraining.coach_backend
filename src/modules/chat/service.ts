import type { ChatConversation, ChatMessage, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { sanitizeFeedbackText, sanitizeHttpUrl, sanitizePagePath } from '../feedback/sanitize.js';
import { isUuid } from '../tracking/sanitize.js';
import { recordEvent } from '../tracking/events.js';
import { emitToConversation, emitToTeam, isTeamOnline } from './realtime.js';
import {
  cancelChatNotification,
  cancelVisitorReplyNotification,
  scheduleChatNotification,
  scheduleVisitorReplyNotification,
} from './notify.js';
import { MAX_MESSAGE } from './quality.js';
import type { CreateChatMessageBody, ListChatQuery } from './schema.js';
import {
  feedbackCategoryLabel,
  feedbackSubcategoryLabel,
  feedbackSummaryLine,
} from '../feedback/labels.js';

const OPEN_STATUSES = ['open', 'waiting_for_team', 'waiting_for_user'] as const;
const VISITOR_SENDERS = ['visitor', 'candidate'] as const;
const TEAM_SENDERS = ['team', 'system'] as const;

const TOPIC_LABELS: Record<string, string> = {
  getting_started: 'Getting started',
  opportunities: 'Opportunities',
  application: 'Application',
  booking: 'Booking',
  profile_match: 'Profile / Match',
  something_else: 'Something else',
};

const messageInclude = {
  feedback: {
    select: {
      id: true,
      category: true,
      subcategory: true,
      message: true,
      rating: true,
      pagePath: true,
      createdAt: true,
      status: true,
    },
  },
} satisfies Prisma.ChatMessageInclude;

type MessageRecord = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

export type FeedbackCardPayload = {
  id: string;
  category: string;
  categoryLabel: string;
  subcategory: string | null;
  subcategoryLabel: string | null;
  message: string;
  rating: number | null;
  pagePath: string;
  createdAt: string;
  status: string;
};

export function serializeFeedbackCard(feedback: {
  id: string;
  category: string;
  subcategory: string | null;
  message: string;
  rating: number | null;
  pagePath: string;
  createdAt: Date;
  status: string;
}): FeedbackCardPayload {
  return {
    id: feedback.id,
    category: feedback.category,
    categoryLabel: feedbackCategoryLabel(feedback.category),
    subcategory: feedback.subcategory,
    subcategoryLabel: feedbackSubcategoryLabel(feedback.subcategory),
    message: feedback.message,
    rating: feedback.rating,
    pagePath: feedback.pagePath,
    createdAt: feedback.createdAt.toISOString(),
    status: feedback.status,
  };
}

function messagePreview(message: ChatMessage): string {
  if (message.messageType === 'feedback') {
    return 'Shared feedback';
  }
  return message.body;
}

type Access = {
  visitorId?: string | null;
  userId?: string | null;
  admin?: boolean;
};

function visitorLabel(conversation: {
  application?: { fullName?: string | null; firstName?: string | null } | null;
  user?: { email?: string | null } | null;
  visitorId?: string | null;
}): string {
  const name = conversation.application?.fullName?.trim() || conversation.application?.firstName?.trim();
  if (name) return name;
  if (conversation.user?.email) return conversation.user.email;
  return 'Anonymous visitor';
}

export function serializeMessage(
  message: ChatMessage | MessageRecord,
  extras?: { senderLabel?: string },
) {
  const feedback =
    'feedback' in message && message.feedback ? serializeFeedbackCard(message.feedback) : null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    senderLabel:
      extras?.senderLabel ??
      (message.senderType === 'team' || message.senderType === 'system' ? 'AI Trainers Team' : 'You'),
    body: message.messageType === 'feedback' ? messagePreview(message) : message.body,
    messageType: message.messageType,
    feedbackId: message.feedbackId ?? null,
    feedback,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
  };
}

function serializeConversation(
  conversation: ChatConversation & {
    application?: { id: string; fullName: string; firstName: string; email: string; profession: string; city: string | null; state: string | null; journeyStage: string; createdAt: Date } | null;
    user?: { id: string; email: string } | null;
    visitor?: { firstSource: string; landingPage: string } | null;
    _count?: { messages: number };
  },
  extras?: {
    lastMessage?: ChatMessage | null;
    unreadCount?: number;
  },
) {
  return {
    id: conversation.id,
    status: conversation.status,
    topic: conversation.topic,
    topicLabel: conversation.topic ? TOPIC_LABELS[conversation.topic] ?? conversation.topic : null,
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
    displayName: visitorLabel(conversation),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    closedAt: conversation.closedAt?.toISOString() ?? null,
    lastMessage: extras?.lastMessage
      ? {
          ...serializeMessage(extras.lastMessage, {
            senderLabel:
              extras.lastMessage.senderType === 'team' || extras.lastMessage.senderType === 'system'
                ? 'AI Trainers Team'
                : visitorLabel(conversation),
          }),
          body: messagePreview(extras.lastMessage),
        }
      : null,
    unreadCount: extras?.unreadCount ?? 0,
  };
}

export async function assertConversationAccess(conversationId: string, access: Access) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    throw notFound('CHAT_NOT_FOUND', 'Conversation not found');
  }
  if (access.admin) {
    return conversation;
  }
  if (access.userId && conversation.userId === access.userId) {
    return conversation;
  }
  if (access.visitorId && conversation.visitorId === access.visitorId) {
    return conversation;
  }
  throw forbidden('You cannot access this conversation');
}

async function resolveLinks(input: { visitorId?: string | null; sessionId?: string | null; userId?: string | null }) {
  const visitorId = isUuid(input.visitorId) ? input.visitorId : null;
  const sessionId = isUuid(input.sessionId) ? input.sessionId : null;
  let visitor = visitorId
    ? await prisma.visitor.findUnique({
        where: { id: visitorId },
        select: {
          id: true,
          userId: true,
          firstSource: true,
          utmSource: true,
          utmCampaign: true,
        },
      })
    : null;
  if (visitorId && !visitor) {
    visitor = await prisma.visitor.create({
      data: { id: visitorId },
      select: {
        id: true,
        userId: true,
        firstSource: true,
        utmSource: true,
        utmCampaign: true,
      },
    });
  }
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
          userId: true,
          journeyStage: true,
          firstSource: true,
          utmSource: true,
          utmCampaign: true,
        },
      })
    : null;
  return { visitor, sessionId, userId: userId ?? application?.userId ?? null, application };
}

async function findOpenConversation(links: { visitor?: { id: string } | null; userId?: string | null }) {
  const or: Prisma.ChatConversationWhereInput[] = [
    ...(links.userId ? [{ userId: links.userId }] : []),
    ...(links.visitor ? [{ visitorId: links.visitor.id }] : []),
  ];
  if (!or.length) {
    return null;
  }
  return prisma.chatConversation.findFirst({
    where: {
      status: { in: [...OPEN_STATUSES] },
      OR: or,
    },
    orderBy: { lastMessageAt: 'desc' },
  });
}

export async function getPublicChat(access: Access) {
  const links = await resolveLinks(access);
  const conversation = await findOpenConversation(links);
  if (!conversation) {
    return {
      conversation: null,
      messages: [] as ReturnType<typeof serializeMessage>[],
      unreadCount: 0,
      teamOnline: isTeamOnline(),
      hasMore: false,
    };
  }
  await assertConversationAccess(conversation.id, access);
  const { messages, hasMore, unreadCount } = await listMessages(conversation.id, { limit: 40, unreadFor: 'visitor' });
  return {
    conversation: serializeConversation(conversation),
    messages,
    unreadCount,
    teamOnline: isTeamOnline(),
    hasMore,
  };
}

export async function listMessages(
  conversationId: string,
  query: { before?: string; limit?: number; unreadFor?: 'visitor' | 'team' },
) {
  const limit = query.limit ?? 40;
  const before = query.before
    ? await prisma.chatMessage.findUnique({
        where: { id: query.before },
        select: { createdAt: true },
      })
    : null;
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      ...(before ? { createdAt: { lt: before.createdAt } } : {}),
    },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const unreadCount = await prisma.chatMessage.count({
    where: {
      conversationId,
      senderType: { in: query.unreadFor === 'team' ? [...VISITOR_SENDERS] : [...TEAM_SENDERS] },
      readAt: null,
    },
  });
  return {
    messages: page.reverse().map((item) => serializeMessage(item)),
    hasMore,
    unreadCount,
  };
}

export async function sendPublicMessage(input: CreateChatMessageBody, extras: { userId?: string | null }) {
  if (input.companyWebsite) {
    return { discarded: true as const };
  }
  const links = await resolveLinks({
    visitorId: input.visitorId,
    sessionId: input.sessionId,
    userId: extras.userId,
  });
  if (!links.visitor && !links.userId) {
    throw badRequest('CHAT_IDENTITY_REQUIRED', 'A visitor or account is required to start chat.');
  }

  let conversation = input.conversationId
    ? await assertConversationAccess(input.conversationId, {
        visitorId: links.visitor?.id,
        userId: links.userId,
      })
    : await findOpenConversation(links);

  const body = sanitizeFeedbackText(input.body, MAX_MESSAGE);
  const now = new Date();
  const senderType = extras.userId ? 'candidate' : 'visitor';
  const pagePath = input.pagePath ? sanitizePagePath(input.pagePath) : conversation?.startedFromPage ?? '/';
  const pageUrl = sanitizeHttpUrl(input.pageUrl ?? null) || null;

  if (!conversation || conversation.status === 'closed' || conversation.status === 'resolved') {
    conversation = await prisma.chatConversation.create({
      data: {
        visitorId: links.visitor?.id ?? null,
        sessionId: links.sessionId,
        userId: links.userId,
        applicationId: links.application?.id ?? null,
        topic: input.topic ?? null,
        status: 'waiting_for_team',
        startedFromPage: pagePath,
        startedFromUrl: pageUrl,
        firstSource: links.application?.firstSource ?? links.visitor?.firstSource ?? null,
        firstUtmSource: links.application?.utmSource ?? links.visitor?.utmSource ?? null,
        firstUtmCampaign: links.application?.utmCampaign ?? links.visitor?.utmCampaign ?? null,
        currentFunnelStage: links.application?.journeyStage ?? 'visitor',
        contextType: input.contextType ?? null,
        opportunityId: input.opportunityId ?? null,
        opportunityTitle: input.opportunityTitle ?? null,
        opportunityPlatform: input.opportunityPlatform ?? null,
        lastMessageAt: now,
      },
    });
    await recordEvent({
      eventType: 'chat_started',
      visitorId: links.visitor?.id ?? null,
      applicationId: links.application?.id ?? null,
      userId: links.userId,
      sessionId: links.sessionId,
      pagePath,
      opportunityId: input.opportunityId ?? null,
      platform: input.opportunityPlatform ?? null,
      createdBy: 'candidate',
      idempotencyKey: `chat_started:${conversation.id}`,
      metadata: { conversation_id: conversation.id, topic: conversation.topic },
    });
  } else {
    conversation = await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'waiting_for_team',
        lastMessageAt: now,
        topic: conversation.topic ?? input.topic ?? null,
        userId: conversation.userId ?? links.userId,
        applicationId: conversation.applicationId ?? links.application?.id ?? null,
        visitorId: conversation.visitorId ?? links.visitor?.id ?? null,
        sessionId: conversation.sessionId ?? links.sessionId,
      },
    });
  }

  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderType,
      senderUserId: extras.userId ?? null,
      body,
      messageType: 'text',
    },
  });

  const payload = {
    conversation: serializeConversation(conversation, { lastMessage: message, unreadCount: 1 }),
    message: serializeMessage(message),
    teamOnline: isTeamOnline(),
  };
  emitToConversation(conversation.id, 'message:new', payload);
  emitToTeam('inbox:update', payload);
  scheduleChatNotification({
    conversationId: conversation.id,
    preview: body,
    topic: conversation.topic,
    visitorLabel: visitorLabel(conversation),
  });
  return payload;
}

export async function markPublicRead(conversationId: string, access: Access) {
  await assertConversationAccess(conversationId, access);
  await prisma.chatMessage.updateMany({
    where: {
      conversationId,
      senderType: { in: [...TEAM_SENDERS] },
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  cancelVisitorReplyNotification(conversationId);
  emitToConversation(conversationId, 'message:read', { conversationId, reader: 'visitor' });
  return { ok: true };
}

export async function saveContactEmail(conversationId: string, email: string, access: Access) {
  const conversation = await assertConversationAccess(conversationId, access);
  const updated = await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { contactEmail: email.toLowerCase() },
  });
  return serializeConversation(updated);
}

export async function publicUnreadCount(access: Access) {
  const links = await resolveLinks(access);
  const conversation = await findOpenConversation(links);
  if (!conversation) {
    return { unreadCount: 0, teamOnline: isTeamOnline(), conversationId: null as string | null };
  }
  const unreadCount = await prisma.chatMessage.count({
    where: {
      conversationId: conversation.id,
      senderType: { in: [...TEAM_SENDERS] },
      readAt: null,
    },
  });
  return { unreadCount, teamOnline: isTeamOnline(), conversationId: conversation.id };
}

export async function listAdminConversations(query: ListChatQuery) {
  const where: Prisma.ChatConversationWhereInput = {};
  if (query.status === 'unread') {
    where.messages = { some: { senderType: { in: [...VISITOR_SENDERS] }, readAt: null } };
  } else if (query.status === 'open') {
    where.status = { in: [...OPEN_STATUSES] };
  } else if (query.status !== 'all') {
    where.status = query.status;
  }
  if (query.q) {
    const q = query.q.trim();
    where.OR = [
      { id: q },
      { topic: { contains: q, mode: 'insensitive' } },
      { application: { fullName: { contains: q, mode: 'insensitive' } } },
      { application: { email: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { contactEmail: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, unreadTotal, items] = await Promise.all([
    prisma.chatConversation.count({ where }),
    prisma.chatConversation.count({
      where: { messages: { some: { senderType: { in: [...VISITOR_SENDERS] }, readAt: null } } },
    }),
    prisma.chatConversation.findMany({
      where,
      include: {
        application: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            email: true,
            profession: true,
            city: true,
            state: true,
            journeyStage: true,
            createdAt: true,
          },
        },
        user: { select: { id: true, email: true } },
        visitor: { select: { firstSource: true, landingPage: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        feedback: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, category: true, subcategory: true, createdAt: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const ids = items.map((item) => item.id);
  const unreadRows = ids.length
    ? await prisma.chatMessage.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: ids },
          senderType: { in: [...VISITOR_SENDERS] },
          readAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const unreadMap = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));

  return {
    total,
    unreadCount: unreadTotal,
    page: query.page,
    pageSize: query.pageSize,
    items: items.map((item) =>
      serializeConversation(item, {
        lastMessage: item.messages[0] ?? null,
        unreadCount: unreadMap.get(item.id) ?? 0,
      }),
    ),
  };
}

const JOURNEY_LABELS: Record<string, string> = {
  visitor: 'Visitor',
  application_started: 'Application started',
  application_submitted: 'Applied',
  intro_call_booked: 'Booked',
  intro_call_attended: 'Call attended',
  coaching_started: 'Coaching',
  platform_applied: 'Platform applied',
  platform_assessment: 'Assessment',
  platform_interview: 'Interview',
  platform_interview_passed: 'Passed',
  project_started: 'Working',
  inactive: 'Inactive',
};

export async function getAdminConversation(id: string) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
    include: {
      application: {
        select: {
          id: true,
          fullName: true,
          firstName: true,
          lastName: true,
          email: true,
          profession: true,
          city: true,
          state: true,
          journeyStage: true,
          createdAt: true,
          bookings: {
            where: { status: 'confirmed' },
            orderBy: { startsAt: 'desc' },
            take: 1,
            select: { id: true, startsAt: true, attendance: true },
          },
        },
      },
      user: { select: { id: true, email: true } },
      visitor: { select: { firstSource: true, landingPage: true, firstSeenAt: true } },
      feedback: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          category: true,
          subcategory: true,
          message: true,
          rating: true,
          pagePath: true,
          createdAt: true,
          status: true,
        },
      },
    },
  });
  if (!conversation) {
    throw notFound('CHAT_NOT_FOUND', 'Conversation not found');
  }
  const { messages, hasMore, unreadCount } = await listMessages(id, { limit: 40, unreadFor: 'team' });
  const booking = conversation.application?.bookings[0] ?? null;
  const latestFeedback = conversation.feedback[0] ?? null;
  return {
    conversation: {
      ...serializeConversation(conversation, { unreadCount }),
      context: {
        displayName: visitorLabel(conversation),
        profession: conversation.application?.profession || null,
        location: [conversation.application?.city, conversation.application?.state].filter(Boolean).join(', ') || null,
        email: conversation.application?.email || conversation.user?.email || conversation.contactEmail || null,
        source: conversation.firstSource || conversation.visitor?.firstSource || null,
        journeyStage: conversation.currentFunnelStage || conversation.application?.journeyStage || 'visitor',
        journeyLabel: JOURNEY_LABELS[conversation.currentFunnelStage || conversation.application?.journeyStage || 'visitor'] ?? 'Visitor',
        applicationId: conversation.applicationId,
        applicationCreatedAt: conversation.application?.createdAt.toISOString() ?? null,
        introCall: booking
          ? { id: booking.id, startsAt: booking.startsAt.toISOString(), attendance: booking.attendance }
          : null,
        startedFromPage: conversation.startedFromPage,
        opportunityTitle: conversation.opportunityTitle,
        opportunityPlatform: conversation.opportunityPlatform,
        feedback: latestFeedback
          ? {
              ...serializeFeedbackCard(latestFeedback),
              submittedAt: latestFeedback.createdAt.toISOString(),
            }
          : null,
      },
    },
    messages,
    hasMore,
    teamOnline: isTeamOnline(),
  };
}

export async function sendAdminMessage(conversationId: string, body: string) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      application: { select: { email: true } },
      user: { select: { email: true } },
      feedback: { select: { id: true }, take: 1 },
    },
  });
  if (!conversation) {
    throw notFound('CHAT_NOT_FOUND', 'Conversation not found');
  }
  if (conversation.status === 'closed') {
    throw badRequest('CHAT_CLOSED', 'This conversation is closed.');
  }
  const now = new Date();
  const text = sanitizeFeedbackText(body, MAX_MESSAGE);
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId,
        senderType: 'team',
        body: text,
        messageType: 'text',
      },
    }),
    prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderType: { in: [...VISITOR_SENDERS] },
        readAt: null,
      },
      data: { readAt: now },
    }),
    prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        status: 'waiting_for_user',
        lastMessageAt: now,
        closedAt: null,
      },
    }),
  ]);
  cancelChatNotification(conversationId);
  const updated = await prisma.chatConversation.findUniqueOrThrow({ where: { id: conversationId } });
  const hasFeedback = conversation.feedback.length > 0;
  await recordEvent({
    eventType: hasFeedback ? 'team_replied_to_feedback' : 'team_reply_received',
    visitorId: conversation.visitorId,
    applicationId: conversation.applicationId,
    userId: conversation.userId,
    createdBy: 'admin',
    idempotencyKey: hasFeedback
      ? `team_replied_to_feedback:${conversation.id}`
      : `team_reply_received:${conversation.id}`,
    metadata: { conversation_id: conversation.id, ...(hasFeedback ? { feedback_id: conversation.feedback[0]?.id } : {}) },
  });
  const visitorEmail =
    conversation.contactEmail || conversation.application?.email || conversation.user?.email || null;
  if (visitorEmail) {
    scheduleVisitorReplyNotification({
      conversationId,
      email: visitorEmail,
      preview: text,
    });
  }
  const payload = {
    conversation: serializeConversation(updated, { lastMessage: message, unreadCount: 0 }),
    message: serializeMessage(message),
    teamOnline: isTeamOnline(),
  };
  emitToConversation(conversationId, 'message:new', payload);
  emitToTeam('inbox:update', payload);
  return payload;
}

export async function markAdminRead(conversationId: string) {
  await prisma.chatConversation.findUniqueOrThrow({ where: { id: conversationId } }).catch(() => {
    throw notFound('CHAT_NOT_FOUND', 'Conversation not found');
  });
  await prisma.chatMessage.updateMany({
    where: {
      conversationId,
      senderType: { in: [...VISITOR_SENDERS] },
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  cancelChatNotification(conversationId);
  emitToConversation(conversationId, 'message:read', { conversationId, reader: 'team' });
  emitToTeam('inbox:update', { conversationId, unreadCount: 0 });
  return { ok: true };
}

export async function updateConversationStatus(id: string, status: ChatConversation['status']) {
  const current = await prisma.chatConversation.findUnique({ where: { id } });
  if (!current) {
    throw notFound('CHAT_NOT_FOUND', 'Conversation not found');
  }
  const updated = await prisma.chatConversation.update({
    where: { id },
    data: {
      status,
      closedAt: status === 'closed' || status === 'resolved' ? new Date() : null,
    },
  });
  if (status === 'resolved' || status === 'closed') {
    await recordEvent({
      eventType: 'chat_resolved',
      visitorId: updated.visitorId,
      applicationId: updated.applicationId,
      userId: updated.userId,
      createdBy: 'admin',
      idempotencyKey: `chat_resolved:${updated.id}:${status}`,
      metadata: { conversation_id: updated.id, status },
    });
  }
  const payload = { conversation: serializeConversation(updated) };
  emitToConversation(id, 'conversation:update', payload);
  emitToTeam('inbox:update', payload);
  return payload;
}

export async function adminUnreadCount() {
  const unreadCount = await prisma.chatConversation.count({
    where: { messages: { some: { senderType: { in: [...VISITOR_SENDERS] }, readAt: null } } },
  });
  return { unreadCount, teamOnline: isTeamOnline() };
}

export async function linkChatConversations(input: {
  visitorId: string;
  applicationId?: string | null;
  userId?: string | null;
}) {
  if (input.applicationId) {
    await prisma.chatConversation.updateMany({
      where: { visitorId: input.visitorId, applicationId: null },
      data: { applicationId: input.applicationId },
    });
  }
  if (input.userId) {
    await prisma.chatConversation.updateMany({
      where: { visitorId: input.visitorId, userId: null },
      data: { userId: input.userId },
    });
  }
}

function topicFromFeedback(feedback: { category: string; subcategory: string | null }): string | null {
  if (feedback.subcategory === 'profile_match' || feedback.subcategory === 'profile') return 'profile_match';
  if (feedback.subcategory === 'opportunities' || feedback.subcategory === 'opportunity_issue') return 'opportunities';
  if (feedback.subcategory === 'apply' || feedback.subcategory === 'application') return 'application';
  if (feedback.subcategory === 'booking' || feedback.subcategory === 'book_call' || feedback.subcategory === 'booking_issue') {
    return 'booking';
  }
  if (feedback.category === 'question') return 'getting_started';
  return 'something_else';
}

export async function attachFeedbackToConversation(feedback: {
  id: string;
  category: string;
  subcategory: string | null;
  message: string;
  rating: number | null;
  pagePath: string;
  createdAt: Date;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  applicationId?: string | null;
  email?: string | null;
}) {
  const links = await resolveLinks({
    visitorId: feedback.visitorId,
    sessionId: feedback.sessionId,
    userId: feedback.userId,
  });
  if (!links.visitor && !links.userId) {
    return { conversation: null, message: null, teamOnline: isTeamOnline() };
  }

  let conversation = await findOpenConversation(links);
  const now = new Date();
  const senderType = feedback.userId ? 'candidate' : 'visitor';
  const summary = feedbackSummaryLine(feedback);

  if (!conversation || conversation.status === 'closed' || conversation.status === 'resolved') {
    conversation = await prisma.chatConversation.create({
      data: {
        visitorId: links.visitor?.id ?? null,
        sessionId: links.sessionId,
        userId: links.userId,
        applicationId: links.application?.id ?? feedback.applicationId ?? null,
        topic: topicFromFeedback(feedback),
        status: 'waiting_for_team',
        startedFromPage: feedback.pagePath || '/',
        firstSource: links.application?.firstSource ?? links.visitor?.firstSource ?? null,
        firstUtmSource: links.application?.utmSource ?? links.visitor?.utmSource ?? null,
        firstUtmCampaign: links.application?.utmCampaign ?? links.visitor?.utmCampaign ?? null,
        currentFunnelStage: links.application?.journeyStage ?? 'visitor',
        contextType: 'feedback',
        contactEmail: feedback.email ?? null,
        lastMessageAt: now,
      },
    });
    await recordEvent({
      eventType: 'chat_started',
      visitorId: links.visitor?.id ?? null,
      applicationId: links.application?.id ?? feedback.applicationId ?? null,
      userId: links.userId,
      sessionId: links.sessionId,
      pagePath: feedback.pagePath,
      createdBy: 'candidate',
      idempotencyKey: `chat_started:${conversation.id}`,
      metadata: { conversation_id: conversation.id, topic: conversation.topic, source: 'feedback' },
    });
  } else {
    conversation = await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'waiting_for_team',
        lastMessageAt: now,
        topic: conversation.topic ?? topicFromFeedback(feedback),
        userId: conversation.userId ?? links.userId,
        applicationId: conversation.applicationId ?? links.application?.id ?? feedback.applicationId ?? null,
        visitorId: conversation.visitorId ?? links.visitor?.id ?? null,
        sessionId: conversation.sessionId ?? links.sessionId,
        contactEmail: conversation.contactEmail ?? feedback.email ?? null,
      },
    });
  }

  const existingMessage = await prisma.chatMessage.findFirst({
    where: { feedbackId: feedback.id },
    include: messageInclude,
  });
  const message =
    existingMessage ??
    (await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderType,
        senderUserId: feedback.userId ?? null,
        body: summary,
        messageType: 'feedback',
        feedbackId: feedback.id,
      },
      include: messageInclude,
    }));

  await prisma.feedback.update({
    where: { id: feedback.id },
    data: {
      conversationId: conversation.id,
      visitorId: links.visitor?.id ?? feedback.visitorId ?? null,
      sessionId: links.sessionId ?? feedback.sessionId ?? null,
      applicationId: links.application?.id ?? feedback.applicationId ?? null,
      userId: links.userId ?? feedback.userId ?? null,
    },
  });

  const payload = {
    conversation: serializeConversation(conversation, { lastMessage: message, unreadCount: 1 }),
    message: serializeMessage(message),
    teamOnline: isTeamOnline(),
  };
  emitToConversation(conversation.id, 'message:new', payload);
  emitToTeam('inbox:update', payload);
  scheduleChatNotification({
    conversationId: conversation.id,
    preview: `Feedback: ${summary}`,
    topic: conversation.topic,
    visitorLabel: visitorLabel(conversation),
  });
  return payload;
}

export async function ensureConversationForFeedback(feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) {
    throw notFound('FEEDBACK_NOT_FOUND', 'Feedback not found');
  }
  if (feedback.status === 'spam' || feedback.status === 'archived') {
    throw badRequest('FEEDBACK_NOT_REPLYABLE', 'This feedback is not available for reply.');
  }
  if (feedback.conversationId) {
    return getAdminConversation(feedback.conversationId);
  }
  if (!feedback.visitorId && !feedback.userId) {
    throw badRequest(
      'FEEDBACK_CONVERSATION_UNAVAILABLE',
      'Conversation unavailable for this older anonymous feedback.',
    );
  }
  const attached = await attachFeedbackToConversation(feedback);
  if (!attached.conversation) {
    throw badRequest(
      'FEEDBACK_CONVERSATION_UNAVAILABLE',
      'Conversation unavailable for this older anonymous feedback.',
    );
  }
  return getAdminConversation(attached.conversation.id);
}
