import type { Feedback, JourneyStage, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { recordEvent } from '../tracking/events.js';
import { isUuid } from '../tracking/sanitize.js';
import type { CreateFeedbackBody, ListFeedbackQuery } from './schema.js';
import {
  inferDeviceType,
  MAX_UA,
  parseBrowserName,
  sanitizeFeedbackText,
  sanitizeHttpUrl,
  sanitizePagePath,
} from './sanitize.js';

export {
  inferDeviceType,
  parseBrowserName,
  sanitizeFeedbackText,
  sanitizeHttpUrl,
  sanitizePagePath,
} from './sanitize.js';

const feedbackInclude = {
  visitor: { select: { id: true, firstSource: true } },
  application: { select: { id: true, journeyStage: true, firstName: true, lastName: true } },
  conversation: {
    select: {
      id: true,
      status: true,
      messages: {
        where: { senderType: 'team' },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { createdAt: true },
      },
    },
  },
} satisfies Prisma.FeedbackInclude;

type FeedbackRecord = Prisma.FeedbackGetPayload<{ include: typeof feedbackInclude }>;

function journeyContextLabel(stage: JourneyStage | null | undefined): string | null {
  if (!stage || stage === 'inactive') return null;
  if (stage === 'visitor') return 'Visitor';
  if (stage === 'application_started' || stage === 'application_submitted') return 'Applied';
  if (stage === 'intro_call_booked') return 'Booked';
  if (stage === 'intro_call_attended' || stage === 'coaching_started') return 'Call Attended';
  if (stage === 'project_started') return 'Working';
  if (stage.startsWith('platform_')) return 'Interview';
  return null;
}

export function areaLabel(pagePath: string, category: string, subcategory: string | null): string {
  const path = pagePath.toLowerCase();
  if (path.startsWith('/profile') || subcategory === 'profile_match' || subcategory === 'profile') {
    return 'Profile / Match';
  }
  if (path.startsWith('/opportunities') || subcategory === 'opportunities' || subcategory === 'opportunity_issue') {
    return 'Opportunities';
  }
  if (path.includes('apply') || subcategory === 'application' || subcategory === 'apply') {
    return 'Application';
  }
  if (path.includes('book') || subcategory === 'booking' || subcategory === 'book_call' || subcategory === 'booking_issue') {
    return 'Booking';
  }
  if (path === '/' || path === '') return 'Homepage';
  return category === 'confusing' ? 'UX Confusion' : pagePath;
}

export function serializeFeedback(feedback: Feedback | FeedbackRecord) {
  const record = feedback as FeedbackRecord;
  return {
    id: feedback.id,
    category: feedback.category,
    subcategory: feedback.subcategory,
    message: feedback.message,
    rating: feedback.rating,
    pagePath: feedback.pagePath,
    pageUrl: feedback.pageUrl,
    userId: feedback.userId,
    email: feedback.email,
    browser: feedback.browser,
    deviceType: feedback.deviceType,
    screenWidth: feedback.screenWidth,
    screenHeight: feedback.screenHeight,
    referrer: feedback.referrer,
    visitorId: feedback.visitorId,
    sessionId: feedback.sessionId,
    applicationId: feedback.applicationId,
    firstSource: record.visitor?.firstSource ?? null,
    journeyStage: record.application?.journeyStage ?? null,
    journeyLabel: journeyContextLabel(record.application?.journeyStage),
    candidateName: record.application
      ? [record.application.firstName, record.application.lastName].filter(Boolean).join(' ')
      : null,
    conversationId: feedback.conversationId,
    conversationStatus: record.conversation?.status ?? null,
    lastTeamReplyAt: record.conversation?.messages?.[0]?.createdAt.toISOString() ?? null,
    canReply: Boolean(
      feedback.conversationId || feedback.visitorId || feedback.userId,
    ) && feedback.status !== 'spam' && feedback.status !== 'archived',
    status: feedback.status,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}

async function resolveFeedbackLinks(input: {
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
}) {
  const visitorId = isUuid(input.visitorId) ? input.visitorId : null;
  const sessionId = isUuid(input.sessionId) ? input.sessionId : null;
  const visitor = visitorId
    ? await prisma.visitor.findUnique({ where: { id: visitorId }, select: { id: true } })
    : null;
  const or: Prisma.ApplicationWhereInput[] = [
    ...(visitor ? [{ visitorId: visitor.id }] : []),
    ...(input.userId ? [{ userId: input.userId }] : []),
  ];
  const application = or.length
    ? await prisma.application.findFirst({
        where: { OR: or },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;

  return {
    visitorId: visitor?.id ?? null,
    sessionId,
    applicationId: application?.id ?? null,
  };
}

export async function createFeedback(
  input: CreateFeedbackBody,
  extras: { userId?: string | null; userAgent?: string | null },
) {
  const userAgent = sanitizeFeedbackText(extras.userAgent ?? '', MAX_UA) || null;
  const message = sanitizeFeedbackText(input.message);
  const referrer = sanitizeHttpUrl(input.metadata.referrer ?? null) || null;
  const links = await resolveFeedbackLinks({
    visitorId: input.visitorId,
    sessionId: input.sessionId,
    userId: extras.userId,
  });

  const feedback = await prisma.feedback.create({
    data: {
      category: input.category,
      subcategory: input.subcategory,
      message,
      rating: input.rating,
      pagePath: sanitizePagePath(input.pagePath),
      pageUrl: sanitizeHttpUrl(input.pageUrl) || '',
      userId: extras.userId || null,
      email: input.email,
      browser: parseBrowserName(userAgent ?? ''),
      deviceType: inferDeviceType(userAgent ?? '', input.metadata.deviceType ?? null),
      screenWidth: input.metadata.screenWidth ?? null,
      screenHeight: input.metadata.screenHeight ?? null,
      referrer,
      userAgent,
      visitorId: links.visitorId,
      sessionId: links.sessionId,
      applicationId: links.applicationId,
    },
    include: feedbackInclude,
  });

  await recordEvent({
    eventType: 'feedback_submitted',
    visitorId: links.visitorId,
    applicationId: links.applicationId,
    userId: extras.userId ?? null,
    sessionId: links.sessionId,
    pagePath: feedback.pagePath,
    createdBy: 'candidate',
    idempotencyKey: `feedback_submitted:${feedback.id}`,
    metadata: {
      feedback_id: feedback.id,
      category: feedback.category,
      page_path: feedback.pagePath,
      ...(feedback.rating != null ? { rating: feedback.rating } : {}),
    },
  });

  try {
    const { attachFeedbackToConversation } = await import('../chat/service.js');
    const attached = await attachFeedbackToConversation(feedback);
    const { emitChatEvent } = await import('../chat/realtime.js');
    emitChatEvent(attached.conversation.id, 'message:new', attached);
    emitChatEvent('team', 'inbox:update', { conversation: attached.conversation });
    const linked = await prisma.feedback.findUniqueOrThrow({
      where: { id: feedback.id },
      include: feedbackInclude,
    });
    return linked;
  } catch (error) {
    console.error('[feedback] could not attach conversation', error);
    return feedback;
  }
}

export async function listFeedback(query: ListFeedbackQuery) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.q
      ? {
          OR: [
            { message: { contains: query.q, mode: 'insensitive' as const } },
            { pagePath: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, newCount, items] = await Promise.all([
    prisma.feedback.count({ where }),
    prisma.feedback.count({ where: { status: 'new' } }),
    prisma.feedback.findMany({
      where,
      include: feedbackInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { total, newCount, page: query.page, pageSize: query.pageSize, items };
}

export async function getFeedbackSummary() {
  const [total, newCount, confusingCount, problemCount, positiveRatings, byPage, byGroup, byCategory] = await Promise.all([
    prisma.feedback.count(),
    prisma.feedback.count({ where: { status: 'new' } }),
    prisma.feedback.count({ where: { category: 'confusing' } }),
    prisma.feedback.count({ where: { category: 'problem' } }),
    prisma.feedback.count({ where: { rating: { gte: 3 } } }),
    prisma.feedback.groupBy({
      by: ['pagePath'],
      _count: { _all: true },
      orderBy: { _count: { pagePath: 'desc' } },
      take: 8,
    }),
    prisma.feedback.groupBy({
      by: ['category', 'subcategory', 'pagePath'],
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
      take: 8,
    }),
    prisma.feedback.groupBy({
      by: ['category'],
      _count: { _all: true },
    }),
  ]);

  const areasMap = new Map<string, number>();
  for (const row of byPage) {
    const label = areaLabel(row.pagePath, 'general', null);
    areasMap.set(label, (areasMap.get(label) ?? 0) + row._count._all);
  }

  return {
    total,
    newCount,
    confusingCount,
    problemCount,
    positiveRatings,
    categoryCounts: Object.fromEntries(byCategory.map((row) => [row.category, row._count._all])),
    areas: [...areasMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    similar: byGroup.map((row) => ({
      category: row.category,
      subcategory: row.subcategory,
      pagePath: row.pagePath,
      count: row._count._all,
      label: areaLabel(row.pagePath, row.category, row.subcategory),
    })),
  };
}

export async function getFeedback(id: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id },
    include: feedbackInclude,
  });
  if (!feedback) {
    throw notFound('FEEDBACK_NOT_FOUND', 'Feedback not found');
  }
  return feedback;
}

export async function updateFeedbackStatus(id: string, status: Feedback['status']) {
  try {
    return await prisma.feedback.update({
      where: { id },
      data: { status },
      include: feedbackInclude,
    });
  } catch {
    throw notFound('FEEDBACK_NOT_FOUND', 'Feedback not found');
  }
}
