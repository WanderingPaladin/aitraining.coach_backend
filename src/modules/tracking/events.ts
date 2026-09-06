import type { CandidateEventActor, JourneyStage, Prisma } from '@prisma/client';
import { Prisma as PrismaClient } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { EVENT_STAGE, higherStage, type CandidateEventType } from './types.js';
import { sanitizeMetadata, sanitizePagePath, sanitizePlatform } from './sanitize.js';

export type DbClient = Prisma.TransactionClient | typeof prisma;

export type RecordEventInput = {
  eventType: CandidateEventType;
  visitorId?: string | null;
  applicationId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  bookingId?: string | null;
  platform?: string | null;
  opportunityId?: string | null;
  metadata?: unknown;
  pagePath?: string | null;
  createdBy?: CandidateEventActor;
  idempotencyKey?: string | null;
  occurredAt?: Date;
};

export async function touchApplicationActivity(
  applicationId: string,
  at: Date,
  db: DbClient = prisma,
): Promise<void> {
  await db.application.update({
    where: { id: applicationId },
    data: { lastActivityAt: at },
  });
}

export async function advanceJourneyStage(
  applicationId: string,
  stage: JourneyStage | null | undefined,
  db: DbClient = prisma,
): Promise<JourneyStage | null> {
  if (!stage || stage === 'inactive') {
    return null;
  }
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: { journeyStage: true },
  });
  if (!application) {
    return null;
  }
  const next = higherStage(application.journeyStage, stage);
  if (next === application.journeyStage) {
    return application.journeyStage;
  }
  await db.application.update({
    where: { id: applicationId },
    data: { journeyStage: next, lastActivityAt: new Date() },
  });
  return next;
}

export async function recordEvent(input: RecordEventInput, db: DbClient = prisma) {
  const createdAt = input.occurredAt ?? new Date();
  const data: Prisma.CandidateEventUncheckedCreateInput = {
    eventType: input.eventType,
    visitorId: input.visitorId ?? null,
    applicationId: input.applicationId ?? null,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    bookingId: input.bookingId ?? null,
    platform: sanitizePlatform(input.platform),
    opportunityId: input.opportunityId?.slice(0, 80) ?? null,
    metadata: sanitizeMetadata(input.metadata) ?? undefined,
    pagePath: sanitizePagePath(input.pagePath),
    createdBy: input.createdBy ?? 'system',
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt,
  };

  try {
    const event = await db.candidateEvent.create({ data });
    if (input.applicationId) {
      await advanceJourneyStage(
        input.applicationId,
        EVENT_STAGE[input.eventType] ?? null,
        db,
      );
      await touchApplicationActivity(input.applicationId, createdAt, db);
    }
    return { event, created: true };
  } catch (error) {
    if (
      error instanceof PrismaClient.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      input.idempotencyKey
    ) {
      const existing = await db.candidateEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      return { event: existing, created: false };
    }
    throw error;
  }
}
