import type {
  ActivityType,
  Application,
  ApplicationStatus,
  PipelineStage,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { isPublicIp, lookupIpLocation } from '../../lib/geo.js';
import { sendApplicationReceived } from '../../lib/mailer.js';
import {
  csvEscape,
  experienceLabel,
  PIPELINE_LABELS,
  sanitizeAssignee,
  sanitizeNoteBody,
  sanitizeTag,
  situationLabel,
  uniqueTags,
} from '../admin/labels.js';
import type {
  CreateApplicationBody,
  ListApplicationsQuery,
  PatchApplicationBody,
} from './schema.js';

const BLOCKED_REAPPLY_STATUSES: ApplicationStatus[] = ['booked', 'reviewed', 'advanced'];

type ApplicationWithAdmin = Application & {
  notes?: Array<{ id: string; author: string; body: string; createdAt: Date }>;
  activities?: Array<{
    id: string;
    type: ActivityType;
    actor: string;
    message: string;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }>;
};

export function serializeApplication(application: ApplicationWithAdmin) {
  return {
    id: application.id,
    firstName: application.firstName,
    lastName: application.lastName,
    fullName: application.fullName,
    email: application.email,
    phone: application.phone,
    city: application.city,
    state: application.state,
    profession: application.profession,
    yearsOfExperience: application.yearsOfExperience,
    experienceLabel: experienceLabel(application.yearsOfExperience),
    location: application.location,
    timezone: application.timezone,
    path: application.path,
    linkedinUrl: application.linkedinUrl,
    githubUrl: null as string | null,
    background: application.background,
    goals: application.goals,
    interestReason: application.goals || application.background || '',
    ipAddress: application.ipAddress,
    ipLocation: application.ipLocation,
    applicant_stage: application.applicantStage,
    candidateSituation: situationLabel(application.applicantStage),
    referral_source: application.referralSource,
    us_eligibility_confirmed: application.usEligibilityConfirmed,
    status: application.status,
    pipelineStage: application.pipelineStage,
    assignee: application.assignee,
    tags: application.tags,
    nextActionAt: application.nextActionAt?.toISOString() ?? null,
    demoScheduledAt: application.demoScheduledAt?.toISOString() ?? null,
    resume: null as { fileName: string; contentType: string } | null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    submittedAt: application.createdAt.toISOString(),
    notes: application.notes?.map((note) => ({
      id: note.id,
      author: note.author,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
    activities: application.activities?.map((activity) => ({
      id: activity.id,
      type: activity.type,
      actor: activity.actor,
      message: activity.message,
      metadata: activity.metadata,
      createdAt: activity.createdAt.toISOString(),
    })),
  };
}

function applicationWhere(input: ListApplicationsQuery): Prisma.ApplicationWhereInput {
  const query = input.q?.trim();
  const stages = input.stage;
  const situations = input.applicantStage;
  return {
    ...(input.ids?.length ? { id: { in: input.ids } } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(stages?.length ? { pipelineStage: { in: stages } } : {}),
    ...(situations?.length ? { applicantStage: { in: situations } } : {}),
    ...(input.profession ? { profession: input.profession } : {}),
    ...(input.state ? { state: input.state.toUpperCase() } : {}),
    ...(input.assignee ? { assignee: input.assignee } : {}),
    ...(input.unassigned ? { assignee: null } : {}),
    ...(input.tag ? { tags: { has: input.tag } } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.experienceMin != null || input.experienceMax != null
      ? {
          yearsOfExperience: {
            ...(input.experienceMin != null ? { gte: input.experienceMin } : {}),
            ...(input.experienceMax != null ? { lte: input.experienceMax } : {}),
          },
        }
      : {}),
    ...(input.submittedFrom || input.submittedTo
      ? {
          createdAt: {
            ...(input.submittedFrom ? { gte: new Date(input.submittedFrom) } : {}),
            ...(input.submittedTo ? { lte: new Date(input.submittedTo) } : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { fullName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { city: { contains: query, mode: 'insensitive' } },
            { profession: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

async function recordActivity(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    applicationId: string;
    type: ActivityType;
    actor: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.applicationActivity.create({
    data: {
      applicationId: input.applicationId,
      type: input.type,
      actor: input.actor,
      message: input.message,
      metadata: input.metadata,
    },
  });
}

export async function createOrUpdateApplication(
  input: CreateApplicationBody & { requestIp?: string },
) {
  const existing = await prisma.application.findFirst({
    where: { email: input.email },
    orderBy: { createdAt: 'desc' },
  });

  if (existing && BLOCKED_REAPPLY_STATUSES.includes(existing.status)) {
    throw conflict(
      'APPLICATION_EXISTS',
      'An application for this email is already in progress',
    );
  }

  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const requestIp = isPublicIp(input.requestIp) ? input.requestIp : undefined;
  const clientIp = isPublicIp(input.ipAddress) ? input.ipAddress : requestIp;
  const geo =
    input.ipLocation
      ? null
      : await lookupIpLocation(clientIp);

  const data: Prisma.ApplicationCreateInput = {
    firstName: input.firstName,
    lastName: input.lastName,
    fullName,
    email: input.email,
    phone: input.phone,
    city: input.city,
    state: input.state,
    profession: input.profession,
    yearsOfExperience: input.yearsOfExperience,
    location: `${input.city}, ${input.state}`,
    timezone: input.timezone,
    path:
      input.applicant_stage === 'new_no_account' ? 'new_professional' : 'current_trainer',
    applicantStage: input.applicant_stage,
    referralSource: input.referral_source || null,
    usEligibilityConfirmed: input.us_eligibility_confirmed,
    background: '',
    goals: '',
    ipAddress: clientIp ?? geo?.ip ?? null,
    ipLocation: input.ipLocation || geo?.label || null,
    status: 'submitted',
  };

  const created = !existing || existing.status === 'declined';
  const application =
    existing && existing.status === 'submitted'
      ? await prisma.application.update({ where: { id: existing.id }, data })
      : await prisma.application.create({ data: { ...data, pipelineStage: 'NEW' } });

  if (created) {
    await recordActivity(prisma, {
      applicationId: application.id,
      type: 'submitted',
      actor: 'system',
      message: 'Application submitted',
    });
  }

  await sendApplicationReceived({
    email: application.email,
    firstName: application.firstName,
    fullName: application.fullName,
    phone: application.phone,
    city: application.city,
    state: application.state,
    profession: application.profession,
    experience: experienceLabel(application.yearsOfExperience),
    situation: situationLabel(application.applicantStage),
    referralSource: application.referralSource,
    timezone: application.timezone,
    usEligible: application.usEligibilityConfirmed,
    ipLocation: application.ipLocation,
  });

  return {
    application,
    created,
  };
}

export async function listApplications(input: ListApplicationsQuery) {
  const where = applicationWhere(input);
  const orderBy: Prisma.ApplicationOrderByWithRelationInput = {
    createdAt: input.sort === 'oldest' ? 'asc' : 'desc',
  };

  const [items, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.application.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function listApplicationsForExport(input: ListApplicationsQuery) {
  const where = applicationWhere(input);
  const items = await prisma.application.findMany({
    where,
    orderBy: { createdAt: input.sort === 'oldest' ? 'asc' : 'desc' },
    take: 1000,
  });
  return items;
}

export function applicationsToCsv(items: Application[]): string {
  const header = [
    'id',
    'fullName',
    'email',
    'phone',
    'city',
    'state',
    'profession',
    'experience',
    'situation',
    'timezone',
    'stage',
    'assignee',
    'tags',
    'submittedAt',
    'nextActionAt',
    'demoScheduledAt',
  ];
  const rows = items.map((item) =>
    [
      item.id,
      item.fullName,
      item.email,
      item.phone,
      item.city,
      item.state,
      item.profession,
      experienceLabel(item.yearsOfExperience),
      situationLabel(item.applicantStage) ?? '',
      item.timezone,
      PIPELINE_LABELS[item.pipelineStage],
      item.assignee ?? '',
      item.tags.join('; '),
      item.createdAt.toISOString(),
      item.nextActionAt?.toISOString() ?? '',
      item.demoScheduledAt?.toISOString() ?? '',
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

export async function getApplication(id: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      bookings: { orderBy: { startsAt: 'desc' } },
      notes: { orderBy: { createdAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!application) {
    throw notFound('APPLICATION_NOT_FOUND', 'Application not found');
  }
  const [previous, next] = await Promise.all([
    prisma.application.findFirst({
      where: { createdAt: { gt: application.createdAt } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
    prisma.application.findFirst({
      where: { createdAt: { lt: application.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);
  return { application, previousId: previous?.id ?? null, nextId: next?.id ?? null };
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus) {
  const { application } = await getApplication(id);
  return prisma.application.update({
    where: { id: application.id },
    data: { status },
  });
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return new Date(value);
}

export async function updateApplication(
  id: string,
  input: PatchApplicationBody,
  actor: string,
) {
  const { application } = await getApplication(id);
  const nextTags = input.tags
    ? uniqueTags(input.tags)
    : input.addTag
      ? uniqueTags([...application.tags, input.addTag])
      : undefined;
  const nextAssignee =
    input.assignee === undefined ? undefined : sanitizeAssignee(input.assignee);
  const nextStage = input.pipelineStage;
  const nextActionAt = parseDate(input.nextActionAt);
  const demoScheduledAt = parseDate(input.demoScheduledAt);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.application.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(nextStage ? { pipelineStage: nextStage } : {}),
        ...(nextAssignee !== undefined ? { assignee: nextAssignee } : {}),
        ...(nextTags ? { tags: nextTags } : {}),
        ...(nextActionAt !== undefined ? { nextActionAt } : {}),
        ...(demoScheduledAt !== undefined ? { demoScheduledAt } : {}),
      },
    });

    if (nextStage && nextStage !== application.pipelineStage) {
      await recordActivity(tx, {
        applicationId: id,
        type:
          nextStage === 'ARCHIVED'
            ? 'archived'
            : nextStage === 'REJECTED'
              ? 'rejected'
              : 'stage_changed',
        actor,
        message: `Stage changed from ${PIPELINE_LABELS[application.pipelineStage]} to ${PIPELINE_LABELS[nextStage]}`,
        metadata: { from: application.pipelineStage, to: nextStage },
      });
    }
    if (nextAssignee !== undefined && nextAssignee !== application.assignee) {
      await recordActivity(tx, {
        applicationId: id,
        type: 'assignee_changed',
        actor,
        message: nextAssignee ? `Assigned to ${nextAssignee}` : 'Assignee cleared',
        metadata: { from: application.assignee, to: nextAssignee },
      });
    }
    if (nextTags && nextTags.join('\0') !== application.tags.join('\0')) {
      await recordActivity(tx, {
        applicationId: id,
        type: 'tag_changed',
        actor,
        message: `Tags updated to ${nextTags.join(', ') || '(none)'}`,
        metadata: { from: application.tags, to: nextTags },
      });
    }
    if (
      demoScheduledAt !== undefined &&
      (demoScheduledAt?.getTime() ?? null) !== (application.demoScheduledAt?.getTime() ?? null)
    ) {
      await recordActivity(tx, {
        applicationId: id,
        type: application.demoScheduledAt ? 'demo_updated' : 'demo_scheduled',
        actor,
        message: demoScheduledAt
          ? `Demo scheduled for ${demoScheduledAt.toISOString()}`
          : 'Demo date cleared',
        metadata: {
          from: application.demoScheduledAt?.toISOString() ?? null,
          to: demoScheduledAt?.toISOString() ?? null,
        },
      });
    }
    return result;
  });

  return updated;
}

export async function addApplicationNote(id: string, body: string, actor: string) {
  const text = sanitizeNoteBody(body);
  if (!text) {
    throw badRequest('EMPTY_NOTE', 'Note cannot be empty');
  }
  await getApplication(id);
  return prisma.$transaction(async (tx) => {
    const note = await tx.applicationNote.create({
      data: { applicationId: id, author: actor, body: text },
    });
    await recordActivity(tx, {
      applicationId: id,
      type: 'note_added',
      actor,
      message: 'Private note added',
    });
    return note;
  });
}

export async function bulkUpdateApplications(
  ids: string[],
  input: {
    pipelineStage?: PipelineStage;
    assignee?: string | null;
    addTag?: string;
    archive?: boolean;
  },
  actor: string,
) {
  const uniqueIds = [...new Set(ids)];
  const applications = await prisma.application.findMany({
    where: { id: { in: uniqueIds } },
  });
  if (applications.length !== uniqueIds.length) {
    throw notFound('APPLICATION_NOT_FOUND', 'One or more applications were not found');
  }

  const stage: PipelineStage | undefined = input.archive ? 'ARCHIVED' : input.pipelineStage;
  const assignee = input.assignee === undefined ? undefined : sanitizeAssignee(input.assignee);
  const tag = input.addTag ? sanitizeTag(input.addTag) : '';

  await prisma.$transaction(async (tx) => {
    for (const application of applications) {
      const tags = tag ? uniqueTags([...application.tags, tag]) : undefined;
      await tx.application.update({
        where: { id: application.id },
        data: {
          ...(stage ? { pipelineStage: stage } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
          ...(tags ? { tags } : {}),
        },
      });
      await recordActivity(tx, {
        applicationId: application.id,
        type: 'bulk_updated',
        actor,
        message: 'Bulk update applied',
        metadata: {
          pipelineStage: stage ?? null,
          assignee: assignee ?? null,
          addTag: tag || null,
        },
      });
      if (stage && stage !== application.pipelineStage) {
        await recordActivity(tx, {
          applicationId: application.id,
          type: stage === 'ARCHIVED' ? 'archived' : stage === 'REJECTED' ? 'rejected' : 'stage_changed',
          actor,
          message: `Stage changed from ${PIPELINE_LABELS[application.pipelineStage]} to ${PIPELINE_LABELS[stage]}`,
          metadata: { from: application.pipelineStage, to: stage },
        });
      }
    }
  });

  return { updated: uniqueIds.length };
}

export async function getOverview() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    newThisWeek,
    needsReview,
    demoScheduled,
    qualifiedOnboarding,
    pipelineGroups,
    staleNew,
    contactedNoFollowUp,
    pastDemo,
    recent,
  ] = await Promise.all([
    prisma.application.count({
      where: { createdAt: { gte: weekAgo }, pipelineStage: { not: 'ARCHIVED' } },
    }),
    prisma.application.count({
      where: { pipelineStage: { in: ['NEW', 'REVIEWING'] } },
    }),
    prisma.application.count({ where: { pipelineStage: 'DEMO_SCHEDULED' } }),
    prisma.application.count({
      where: { pipelineStage: { in: ['QUALIFIED', 'ONBOARDING'] } },
    }),
    prisma.application.groupBy({
      by: ['pipelineStage'],
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: { pipelineStage: 'NEW', createdAt: { lt: dayAgo } },
      orderBy: { createdAt: 'asc' },
      take: 8,
    }),
    prisma.application.findMany({
      where: { pipelineStage: 'CONTACTED', nextActionAt: null },
      orderBy: { updatedAt: 'asc' },
      take: 8,
    }),
    prisma.application.findMany({
      where: {
        pipelineStage: 'DEMO_SCHEDULED',
        OR: [
          { demoScheduledAt: { lt: now } },
          { bookings: { some: { status: 'confirmed', startsAt: { lt: now } } } },
        ],
      },
      orderBy: { demoScheduledAt: 'asc' },
      take: 8,
    }),
    prisma.application.findMany({
      where: { pipelineStage: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const pipeline: Record<PipelineStage, number> = {
    NEW: 0,
    REVIEWING: 0,
    CONTACTED: 0,
    DEMO_SCHEDULED: 0,
    QUALIFIED: 0,
    ONBOARDING: 0,
    REJECTED: 0,
    ARCHIVED: 0,
  };
  for (const group of pipelineGroups) {
    pipeline[group.pipelineStage] = group._count._all;
  }

  const attentionIds = new Set<string>();
  const needsAttention = [...staleNew, ...contactedNoFollowUp, ...pastDemo].filter((item) => {
    if (attentionIds.has(item.id)) {
      return false;
    }
    attentionIds.add(item.id);
    return true;
  });

  return {
    kpis: {
      newThisWeek,
      needsReview,
      demoScheduled,
      qualifiedOnboarding,
    },
    pipeline,
    needsAttention,
    recent,
  };
}

export async function listFilterOptions() {
  const [assignees, states, tags] = await Promise.all([
    prisma.application.findMany({
      where: { assignee: { not: null } },
      distinct: ['assignee'],
      select: { assignee: true },
      orderBy: { assignee: 'asc' },
    }),
    prisma.application.findMany({
      distinct: ['state'],
      select: { state: true },
      orderBy: { state: 'asc' },
    }),
    prisma.application.findMany({
      select: { tags: true },
    }),
  ]);

  const tagSet = new Set<string>();
  for (const row of tags) {
    for (const tag of row.tags) {
      tagSet.add(tag);
    }
  }

  return {
    assignees: assignees
      .map((row) => row.assignee)
      .filter((value): value is string => Boolean(value)),
    states: states.map((row) => row.state).filter(Boolean),
    tags: [...tagSet].sort((left, right) => left.localeCompare(right)),
  };
}

export { applicationWhere };
