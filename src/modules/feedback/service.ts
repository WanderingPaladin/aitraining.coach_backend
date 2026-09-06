import type { Feedback } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
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

export function serializeFeedback(feedback: Feedback) {
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
    status: feedback.status,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}

export async function createFeedback(
  input: CreateFeedbackBody,
  extras: { userId?: string | null; userAgent?: string | null },
) {
  const userAgent = sanitizeFeedbackText(extras.userAgent ?? '', MAX_UA) || null;
  const message = sanitizeFeedbackText(input.message);
  const referrer = sanitizeHttpUrl(input.metadata.referrer ?? null) || null;

  return prisma.feedback.create({
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
    },
  });
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
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { total, newCount, page: query.page, pageSize: query.pageSize, items };
}

export async function updateFeedbackStatus(id: string, status: Feedback['status']) {
  try {
    return await prisma.feedback.update({
      where: { id },
      data: { status },
    });
  } catch {
    throw notFound('FEEDBACK_NOT_FOUND', 'Feedback not found');
  }
}
