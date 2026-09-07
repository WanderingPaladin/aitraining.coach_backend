import { prisma } from '../../db/prisma.js';
import { normalizeAttribution, type AttributionInput } from './attribution.js';
import { isUuid } from './sanitize.js';
import type { TrackSessionBody } from './schema.js';
import type { DbClient } from './events.js';

const SESSION_IDLE_MS = 30 * 60 * 1000;

export async function ensureVisitorAndSession(input: TrackSessionBody, extras?: { userId?: string | null }) {
  const attribution = normalizeAttribution(input);
  const now = new Date();
  const userId = extras?.userId ?? null;

  const existing = await prisma.visitor.findUnique({ where: { id: input.visitorId } });
  if (!existing) {
    await prisma.visitor.create({
      data: {
        id: input.visitorId,
        userId,
        firstSeenAt: now,
        lastSeenAt: now,
        landingPage: attribution.landingPage,
        referrer: attribution.referrer,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmContent: attribution.utmContent,
        utmTerm: attribution.utmTerm,
        firstSource: attribution.firstSource,
        lastLandingPage: attribution.landingPage,
        lastReferrer: attribution.referrer,
        lastUtmSource: attribution.utmSource,
        lastUtmMedium: attribution.utmMedium,
        lastUtmCampaign: attribution.utmCampaign,
      },
    });
  } else {
    await prisma.visitor.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        lastLandingPage: attribution.landingPage,
        lastReferrer: attribution.referrer,
        lastUtmSource: attribution.utmSource,
        lastUtmMedium: attribution.utmMedium,
        lastUtmCampaign: attribution.utmCampaign,
        ...(userId && !existing.userId ? { userId } : {}),
      },
    });
  }

  const session = await prisma.visitorSession.findUnique({ where: { id: input.sessionId } });
  if (!session) {
    await prisma.visitorSession.create({
      data: {
        id: input.sessionId,
        visitorId: input.visitorId,
        userId,
        landingPage: attribution.landingPage,
        referrer: attribution.referrer,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmContent: attribution.utmContent,
        utmTerm: attribution.utmTerm,
        deviceType: input.deviceType ?? null,
        browser: input.browser ?? null,
        startedAt: now,
        lastSeenAt: now,
      },
    });
  } else if (session.visitorId === input.visitorId) {
    const stale = now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS;
    await prisma.visitorSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        ...(userId && !session.userId ? { userId } : {}),
        ...(stale
          ? {}
          : {
              deviceType: input.deviceType ?? session.deviceType,
              browser: input.browser ?? session.browser,
            }),
      },
    });
  }

  const visitor = await prisma.visitor.findUniqueOrThrow({ where: { id: input.visitorId } });
  return { visitor, attribution, created: !existing };
}

export async function attachVisitorToApplication(
  applicationId: string,
  visitorId: string | null | undefined,
  db: DbClient = prisma,
) {
  if (!isUuid(visitorId)) {
    return;
  }
  const visitor = await db.visitor.findUnique({ where: { id: visitorId } });
  if (!visitor) {
    return;
  }
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      visitorId: true,
      firstSource: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      userId: true,
    },
  });
  if (!application) {
    return;
  }

  await db.application.update({
    where: { id: applicationId },
    data: {
      visitorId: application.visitorId ?? visitor.id,
      firstSource: application.firstSource ?? visitor.firstSource,
      utmSource: application.utmSource ?? visitor.utmSource,
      utmMedium: application.utmMedium ?? visitor.utmMedium,
      utmCampaign: application.utmCampaign ?? visitor.utmCampaign,
      utmContent: application.utmContent ?? visitor.utmContent,
      utmTerm: application.utmTerm ?? visitor.utmTerm,
      lastActivityAt: new Date(),
    },
  });

  if (application.userId && !visitor.userId) {
    await db.visitor.update({
      where: { id: visitor.id },
      data: { userId: application.userId },
    });
  }

  await db.chatConversation.updateMany({
    where: { visitorId: visitor.id, applicationId: null },
    data: {
      applicationId,
      ...(application.userId ? { userId: application.userId } : {}),
    },
  });

  await db.candidateEvent.updateMany({
    where: { visitorId: visitor.id, applicationId: null },
    data: { applicationId },
  });
}

export async function linkVisitorToUser(userId: string, visitorId?: string | null) {
  if (isUuid(visitorId)) {
    await prisma.visitor.updateMany({
      where: { id: visitorId, userId: null },
      data: { userId },
    });
    await prisma.chatConversation.updateMany({
      where: { visitorId, userId: null },
      data: { userId },
    });
  }
  const applications = await prisma.application.findMany({
    where: { userId },
    select: { visitorId: true },
  });
  const visitorIds = [...new Set(applications.map((item) => item.visitorId).filter(Boolean))] as string[];
  if (visitorIds.length > 0) {
    await prisma.visitor.updateMany({
      where: { id: { in: visitorIds }, userId: null },
      data: { userId },
    });
    await prisma.chatConversation.updateMany({
      where: { visitorId: { in: visitorIds }, userId: null },
      data: { userId },
    });
    await prisma.candidateEvent.updateMany({
      where: { visitorId: { in: visitorIds }, userId: null },
      data: { userId },
    });
  }
}

export function attributionFromUnknown(input?: AttributionInput) {
  return normalizeAttribution(input ?? {});
}
