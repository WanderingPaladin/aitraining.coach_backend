import type {
  IntroCallAttendance,
  JourneyStage,
  PlatformProgressStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { sourceLabel } from './attribution.js';
import { recordEvent } from './events.js';
import { attachVisitorToApplication, ensureVisitorAndSession } from './identity.js';
import {
  inferDeviceType,
  isUuid,
  parseBrowserName,
  sanitizePagePath,
} from './sanitize.js';
import type {
  AnalyticsQuery,
  TrackEventsBody,
  TrackSessionBody,
  UpsertPlatformProgressBody,
} from './schema.js';
import {
  PLATFORM_STATUS_EVENT,
  PLATFORM_STATUS_STAGE,
  type PublicEventType,
} from './types.js';

const INTERVIEW_STAGES: JourneyStage[] = [
  'platform_assessment',
  'platform_interview',
  'platform_interview_passed',
  'project_started',
];
const PASSED_STAGES: JourneyStage[] = ['platform_interview_passed', 'project_started'];
const BOOKED_STAGES: JourneyStage[] = [
  'intro_call_booked',
  'intro_call_attended',
  'coaching_started',
  'platform_applied',
  'platform_assessment',
  'platform_interview',
  'platform_interview_passed',
  'project_started',
];
const ATTENDED_STAGES: JourneyStage[] = [
  'intro_call_attended',
  'coaching_started',
  'platform_applied',
  'platform_assessment',
  'platform_interview',
  'platform_interview_passed',
  'project_started',
];

const ATTENDANCE_EVENT: Record<IntroCallAttendance, string | null> = {
  scheduled: null,
  rescheduled: 'intro_call_rescheduled',
  cancelled: 'intro_call_cancelled',
  attended: 'intro_call_attended',
  no_show: 'intro_call_no_show',
  completed: 'intro_call_attended',
};

export async function ingestSession(
  input: TrackSessionBody,
  extras?: { userId?: string | null; userAgent?: string | null },
) {
  const body: TrackSessionBody = {
    ...input,
    deviceType: input.deviceType ?? inferDeviceType(extras?.userAgent ?? null) ?? undefined,
    browser: input.browser ?? parseBrowserName(extras?.userAgent ?? null) ?? undefined,
  };
  const { visitor, created } = await ensureVisitorAndSession(body, { userId: extras?.userId });
  if (created) {
    await recordEvent({
      eventType: 'site_visited',
      visitorId: visitor.id,
      sessionId: input.sessionId,
      userId: extras?.userId,
      pagePath: sanitizePagePath(input.landingPage),
      createdBy: 'system',
      metadata: { source: visitor.firstSource },
      idempotencyKey: `site_visited:${input.sessionId}`,
    });
  }
  return {
    visitorId: visitor.id,
    sessionId: input.sessionId,
    firstSource: visitor.firstSource,
  };
}

function publicIdempotencyKey(
  eventType: PublicEventType,
  visitorId: string,
  sessionId: string,
  event: TrackEventsBody['events'][number],
): string {
  if (event.idempotencyKey) {
    return event.idempotencyKey.slice(0, 180);
  }
  switch (eventType) {
    case 'page_view':
      return `page_view:${sessionId}:${sanitizePagePath(event.pagePath) ?? '/'}`;
    case 'hero_cta_clicked':
      return `hero_cta_clicked:${sessionId}`;
    case 'application_started':
      return `application_started:${visitorId}`;
    case 'application_stage_selected':
      return `application_stage_selected:${visitorId}:${String(event.metadata?.stage ?? '')}`;
    case 'booking_started':
      return `booking_started:${event.applicationId ?? visitorId}`;
    case 'booking_date_selected':
      return `booking_date_selected:${event.applicationId ?? visitorId}:${String(event.metadata?.date ?? '')}`;
    case 'booking_time_selected':
      return `booking_time_selected:${event.applicationId ?? visitorId}:${String(event.metadata?.startsAt ?? '')}`;
    case 'opportunity_viewed':
      return `opportunity_viewed:${sessionId}:${event.opportunityId ?? ''}`;
    case 'opportunity_saved':
      return `opportunity_saved:${sessionId}:${event.opportunityId ?? ''}`;
    case 'opportunity_external_clicked':
      return `opportunity_external_clicked:${sessionId}:${event.opportunityId ?? ''}`;
    case 'profile_created':
      return `profile_created:${visitorId}`;
    case 'profile_completed':
      return `profile_completed:${visitorId}`;
    default:
      return `${eventType}:${sessionId}`;
  }
}

export async function ingestPublicEvents(
  input: TrackEventsBody,
  extras?: { userId?: string | null },
) {
  const visitor = await prisma.visitor.findUnique({ where: { id: input.visitorId } });
  if (!visitor) {
    await ingestSession(
      {
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        landingPage: '/',
      },
      extras,
    );
  }

  let recorded = 0;
  for (const event of input.events) {
    let applicationId = event.applicationId ?? null;
    if (applicationId) {
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true, visitorId: true, userId: true },
      });
      if (!application || (application.visitorId && application.visitorId !== input.visitorId)) {
        applicationId = null;
      } else if (!application.visitorId) {
        await attachVisitorToApplication(application.id, input.visitorId);
      }
    }
    const result = await recordEvent({
      eventType: event.eventType,
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      userId: extras?.userId,
      applicationId,
      opportunityId: event.opportunityId,
      platform: event.platform,
      metadata: event.metadata,
      pagePath: event.pagePath,
      createdBy: 'candidate',
      idempotencyKey: publicIdempotencyKey(event.eventType, input.visitorId, input.sessionId, event),
    });
    if (result.created) {
      recorded += 1;
    }
    if (event.eventType === 'application_started' && applicationId) {
      await prisma.application.updateMany({
        where: {
          id: applicationId,
          journeyStage: { in: ['visitor'] },
        },
        data: { journeyStage: 'application_started' },
      });
    }
  }
  await prisma.visitor.update({
    where: { id: input.visitorId },
    data: { lastSeenAt: new Date() },
  });
  await prisma.visitorSession.updateMany({
    where: { id: input.sessionId, visitorId: input.visitorId },
    data: { lastSeenAt: new Date(), userId: extras?.userId ?? undefined },
  });
  return { recorded, ignored: input.events.length - recorded };
}

function resolveRange(query: AnalyticsQuery): { from: Date | null; to: Date; label: string } {
  const now = new Date();
  if (query.range === 'all') {
    return { from: null, to: now, label: 'All time' };
  }
  if (query.range === 'custom') {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : now;
    return { from, to, label: 'Custom range' };
  }
  const days: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
  if (query.range === 'today') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { from, to: now, label: 'Today' };
  }
  const span = days[query.range] ?? 30;
  const from = new Date(now.getTime() - span * 24 * 60 * 60 * 1000);
  return { from, to: now, label: query.range === '7d' ? '7 days' : query.range === '90d' ? '90 days' : '30 days' };
}

function percent(part: number, whole: number): number | null {
  if (whole <= 0 || part > whole) {
    return null;
  }
  return Math.round((part / whole) * 1000) / 10;
}

export async function getFunnelAnalytics(query: AnalyticsQuery) {
  const range = resolveRange(query);
  const from = range.from;
  const to = range.to;
  const visitorTime = from ? { gte: from, lte: to } : { lte: to };

  const [visitors, trackingStarted] = await Promise.all([
    prisma.visitor.count({ where: { firstSeenAt: visitorTime } }),
    prisma.visitor.findFirst({ orderBy: { firstSeenAt: 'asc' }, select: { firstSeenAt: true } }),
  ]);

  const cohortWhere: Prisma.ApplicationWhereInput = from
    ? {
        OR: [
          { visitor: { firstSeenAt: { gte: from, lte: to } } },
          { visitorId: null, createdAt: { gte: from, lte: to } },
        ],
      }
    : { createdAt: { lte: to } };

  const applications = await prisma.application.groupBy({
    by: ['firstSource', 'journeyStage'],
    where: cohortWhere,
    _count: { _all: true },
  });

  const visitorSources = await prisma.visitor.groupBy({
    by: ['firstSource'],
    where: { firstSeenAt: visitorTime },
    _count: { _all: true },
  });

  let applicationCount = 0;
  let bookingCount = 0;
  let attendedCount = 0;
  let interviewCount = 0;
  let passedCount = 0;
  let projectCount = 0;

  const sourceMap = new Map<
    string,
    {
      source: string;
      visitors: number;
      applications: number;
      bookings: number;
      attended: number;
      interviews: number;
      passed: number;
      projects: number;
    }
  >();

  function sourceRow(source: string) {
    const key = source || 'unknown';
    const existing = sourceMap.get(key);
    if (existing) {
      return existing;
    }
    const created = {
      source: key,
      visitors: 0,
      applications: 0,
      bookings: 0,
      attended: 0,
      interviews: 0,
      passed: 0,
      projects: 0,
    };
    sourceMap.set(key, created);
    return created;
  }

  for (const row of visitorSources) {
    sourceRow(row.firstSource).visitors = row._count._all;
  }

  for (const application of applications) {
    const count = application._count._all;
    applicationCount += count;
    const source = application.firstSource || 'unknown';
    const row = sourceRow(source);
    row.applications += count;
    const stage = application.journeyStage;

    if (BOOKED_STAGES.includes(stage)) {
      bookingCount += count;
      row.bookings += count;
    }
    if (ATTENDED_STAGES.includes(stage)) {
      attendedCount += count;
      row.attended += count;
    }
    if (INTERVIEW_STAGES.includes(stage)) {
      interviewCount += count;
      row.interviews += count;
    }
    if (PASSED_STAGES.includes(stage)) {
      passedCount += count;
      row.passed += count;
    }
    if (stage === 'project_started') {
      projectCount += count;
      row.projects += count;
    }
  }

  const stages = [
    { key: 'visitors', label: 'Visitors', count: visitors },
    { key: 'applications', label: 'Applications', count: applicationCount },
    { key: 'bookings', label: 'Bookings', count: bookingCount },
    { key: 'attended', label: 'Calls Attended', count: attendedCount },
    { key: 'platform_interviews', label: 'Platform Interviews', count: interviewCount },
    { key: 'passed', label: 'Passed', count: passedCount },
    { key: 'projects', label: 'Project Started', count: projectCount },
  ] as const;

  const conversions = stages.slice(0, -1).map((stage, index) => {
    const next = stages[index + 1]!;
    const rate = percent(next.count, stage.count);
    return {
      from: stage.key,
      to: next.key,
      fromLabel: stage.label,
      toLabel: next.label,
      fromCount: stage.count,
      toCount: next.count,
      dropped: Math.max(0, stage.count - next.count),
      conversion: rate,
    };
  });

  const comparable = conversions.filter((item) => item.fromCount > 0);
  const biggestDropOff = comparable.reduce<(typeof conversions)[number] | null>((worst, item) => {
    if (!worst) {
      return item;
    }
    const worstRate = worst.conversion ?? 100;
    const itemRate = item.conversion ?? 100;
    return itemRate < worstRate ? item : worst;
  }, null);

  return {
    range: {
      preset: query.range,
      from: from?.toISOString() ?? null,
      to: to.toISOString(),
      label: range.label,
      cohort: 'Candidates are grouped by first visit, or by application date when no visitor record exists.',
    },
    trackingStartedAt: trackingStarted?.firstSeenAt.toISOString() ?? null,
    stages,
    conversions,
    biggestDropOff,
    sources: [...sourceMap.values()]
      .sort((left, right) => right.visitors + right.applications - (left.visitors + left.applications))
      .map((row) => ({
        ...row,
        label: sourceLabel(row.source),
        visitorToApplication: percent(row.applications, row.visitors),
        applicationToBooking: percent(row.bookings, row.applications),
        interviewToPass: percent(row.passed, row.interviews),
      })),
  };
}

export function serializeJourneyEvent(event: {
  id: string;
  eventType: string;
  platform: string | null;
  opportunityId: string | null;
  metadata: Prisma.JsonValue;
  pagePath: string | null;
  createdBy: string;
  createdAt: Date;
}) {
  return {
    id: event.id,
    eventType: event.eventType,
    platform: event.platform,
    opportunityId: event.opportunityId,
    metadata: event.metadata,
    pagePath: event.pagePath,
    createdBy: event.createdBy,
    createdAt: event.createdAt.toISOString(),
  };
}

export function serializePlatformProgress(row: {
  id: string;
  platform: string;
  opportunityId: string | null;
  opportunityTitle: string | null;
  status: PlatformProgressStatus;
  appliedAt: Date | null;
  assessmentAt: Date | null;
  interviewAt: Date | null;
  resultAt: Date | null;
  projectStartedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    platform: row.platform,
    opportunityId: row.opportunityId,
    opportunityTitle: row.opportunityTitle,
    status: row.status,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    assessmentAt: row.assessmentAt?.toISOString() ?? null,
    interviewAt: row.interviewAt?.toISOString() ?? null,
    resultAt: row.resultAt?.toISOString() ?? null,
    projectStartedAt: row.projectStartedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listApplicationJourney(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, visitorId: true },
  });
  if (!application) {
    return [];
  }
  const events = await prisma.candidateEvent.findMany({
    where: {
      OR: [
        { applicationId },
        ...(application.visitorId ? [{ visitorId: application.visitorId }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const seen = new Set<string>();
  return events
    .filter((event) => {
      if (seen.has(event.id)) {
        return false;
      }
      seen.add(event.id);
      return true;
    })
    .map(serializeJourneyEvent);
}

export async function listPlatformProgress(applicationId: string) {
  const rows = await prisma.candidateOpportunity.findMany({
    where: { applicationId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(serializePlatformProgress);
}

export async function updateIntroCallAttendance(
  bookingId: string,
  attendance: IntroCallAttendance,
  actor: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { application: true },
  });
  if (!booking) {
    throw notFound('BOOKING_NOT_FOUND', 'Intro call not found');
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      attendance,
      ...(attendance === 'cancelled' && booking.status !== 'cancelled'
        ? { status: 'cancelled', cancelledAt: new Date(), confirmedStartsAt: null }
        : {}),
    },
  });

  const eventType = ATTENDANCE_EVENT[attendance];
  if (eventType) {
    await recordEvent({
      eventType: eventType as 'intro_call_attended',
      applicationId: booking.applicationId,
      visitorId: booking.application.visitorId,
      userId: booking.application.userId,
      bookingId: booking.id,
      createdBy: 'admin',
      metadata: { actor, attendance },
      idempotencyKey: `${eventType}:${booking.id}`,
    });
  }

  if (attendance === 'completed') {
    await prisma.application.updateMany({
      where: {
        id: booking.applicationId,
        journeyStage: {
          in: ['intro_call_booked', 'application_submitted', 'application_started', 'intro_call_attended'],
        },
      },
      data: { journeyStage: 'coaching_started', lastActivityAt: new Date() },
    });
  }

  return updated;
}

function timestampForStatus(status: PlatformProgressStatus, occurredAt: Date) {
  if (status === 'interested' || status === 'applied') {
    return { appliedAt: occurredAt };
  }
  if (status.startsWith('assessment_')) {
    return { assessmentAt: occurredAt };
  }
  if (status.startsWith('interview_') || status === 'waitlisted') {
    return { interviewAt: occurredAt };
  }
  if (status === 'passed' || status === 'rejected') {
    return { resultAt: occurredAt };
  }
  if (status === 'project_received' || status === 'working') {
    return { projectStartedAt: occurredAt, resultAt: occurredAt };
  }
  return {};
}

export async function upsertPlatformProgress(
  applicationId: string,
  input: UpsertPlatformProgressBody,
  actor: string,
) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, visitorId: true, userId: true },
  });
  if (!application) {
    throw notFound('APPLICATION_NOT_FOUND', 'Application not found');
  }
  const platform = input.platform.trim();
  if (!platform) {
    throw badRequest('INVALID_PLATFORM', 'Platform is required');
  }
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const existing = await prisma.candidateOpportunity.findFirst({
    where: {
      applicationId,
      platform: { equals: platform, mode: 'insensitive' },
    },
  });

  const timestamps = timestampForStatus(input.status, occurredAt);
  const row = existing
    ? await prisma.candidateOpportunity.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          opportunityId: input.opportunityId ?? existing.opportunityId,
          opportunityTitle: input.opportunityTitle ?? existing.opportunityTitle,
          notes: input.notes ?? existing.notes,
          ...timestamps,
        },
      })
    : await prisma.candidateOpportunity.create({
        data: {
          applicationId,
          platform,
          status: input.status,
          opportunityId: input.opportunityId ?? null,
          opportunityTitle: input.opportunityTitle ?? null,
          notes: input.notes ?? null,
          ...timestamps,
        },
      });

  const eventType = PLATFORM_STATUS_EVENT[input.status];
  if (eventType) {
    await recordEvent({
      eventType,
      applicationId,
      visitorId: application.visitorId,
      userId: application.userId,
      platform,
      opportunityId: row.opportunityId,
      createdBy: 'admin',
      metadata: {
        actor,
        status: input.status,
        notes: input.notes ? 'set' : undefined,
      },
      idempotencyKey: `${eventType}:${applicationId}:${platform.toLowerCase()}`,
      occurredAt,
    });
  }

  const stage = PLATFORM_STATUS_STAGE[input.status];
  if (stage) {
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        lastActivityAt: occurredAt,
      },
    });
  }

  return row;
}

export async function recordApplicationSubmitted(input: {
  applicationId: string;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
}) {
  let visitorId = input.visitorId ?? null;
  if (isUuid(visitorId)) {
    const visitor = await prisma.visitor.findUnique({ where: { id: visitorId }, select: { id: true } });
    if (visitor) {
      await attachVisitorToApplication(input.applicationId, visitor.id);
    } else {
      visitorId = null;
    }
  } else {
    visitorId = null;
  }
  await recordEvent({
    eventType: 'application_submitted',
    applicationId: input.applicationId,
    visitorId,
    sessionId: input.sessionId,
    userId: input.userId,
    createdBy: 'system',
    idempotencyKey: `application_submitted:${input.applicationId}`,
  });
}

export async function recordBookingConfirmed(input: {
  applicationId: string;
  bookingId: string;
  visitorId?: string | null;
  userId?: string | null;
  rescheduled?: boolean;
}) {
  await recordEvent({
    eventType: 'booking_confirmed',
    applicationId: input.applicationId,
    bookingId: input.bookingId,
    visitorId: input.visitorId,
    userId: input.userId,
    createdBy: 'system',
    idempotencyKey: `booking_confirmed:${input.bookingId}`,
  });
  if (input.rescheduled) {
    await recordEvent({
      eventType: 'intro_call_rescheduled',
      applicationId: input.applicationId,
      bookingId: input.bookingId,
      visitorId: input.visitorId,
      userId: input.userId,
      createdBy: 'system',
      idempotencyKey: `intro_call_rescheduled:${input.bookingId}`,
    });
  }
}

export async function recordBookingCancelled(input: {
  applicationId: string;
  bookingId: string;
  visitorId?: string | null;
  userId?: string | null;
}) {
  await recordEvent({
    eventType: 'intro_call_cancelled',
    applicationId: input.applicationId,
    bookingId: input.bookingId,
    visitorId: input.visitorId,
    userId: input.userId,
    createdBy: 'system',
    idempotencyKey: `intro_call_cancelled:${input.bookingId}`,
  });
}
