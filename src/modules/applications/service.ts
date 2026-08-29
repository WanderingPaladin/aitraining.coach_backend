import type { Application, ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { isPublicIp, lookupIpLocation } from '../../lib/geo.js';
import { sendApplicationReceived } from '../../lib/mailer.js';
import type { CreateApplicationBody } from './schema.js';

const BLOCKED_REAPPLY_STATUSES: ApplicationStatus[] = ['booked', 'reviewed', 'advanced'];

export function serializeApplication(application: Application) {
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
    location: application.location,
    timezone: application.timezone,
    path: application.path,
    linkedinUrl: application.linkedinUrl,
    background: application.background,
    goals: application.goals,
    ipAddress: application.ipAddress,
    ipLocation: application.ipLocation,
    applicant_stage: application.applicantStage,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
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
    background: '',
    goals: '',
    ipAddress: clientIp ?? geo?.ip ?? null,
    ipLocation: input.ipLocation || geo?.label || null,
    status: 'submitted',
  };

  const application =
    existing && existing.status === 'submitted'
      ? await prisma.application.update({ where: { id: existing.id }, data })
      : await prisma.application.create({ data });

  await sendApplicationReceived({ email: application.email, fullName: application.firstName });

  return {
    application,
    created: !existing || existing.status === 'declined',
  };
}

export async function listApplications(input: {
  status?: ApplicationStatus;
  email?: string;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const query = input.q?.trim();
  const where: Prisma.ApplicationWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { fullName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { city: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.application.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function getApplication(id: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { bookings: { orderBy: { startsAt: 'desc' } } },
  });
  if (!application) {
    throw notFound('APPLICATION_NOT_FOUND', 'Application not found');
  }
  return application;
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus) {
  await getApplication(id);
  return prisma.application.update({
    where: { id },
    data: { status },
  });
}
