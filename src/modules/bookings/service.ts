import { randomBytes } from 'node:crypto';
import { Prisma, type Booking } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { sendBookingCancelled, sendBookingConfirmation } from '../../lib/mailer.js';
import { cancelIntroCallEvent, createIntroCallEvent, isMicrosoftGraphConfigured } from '../../lib/graph.js';
import { isOfferedSlot } from '../availability/slots.js';
import { toSlotRule } from '../availability/service.js';

function newCancelToken(): string {
  return randomBytes(24).toString('hex');
}

export function serializeBooking(booking: Booking, options?: { includeCancelToken?: boolean }) {
  return {
    id: booking.id,
    applicationId: booking.applicationId,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
    meetingUrl: booking.meetingUrl,
    createdAt: booking.createdAt.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    ...(options?.includeCancelToken ? { cancelToken: booking.cancelToken } : {}),
  };
}

export async function createBooking(input: { applicationId: string; startsAt: string }) {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw badRequest('INVALID_SLOT', 'startsAt must be a valid datetime');
  }

  const application = await prisma.application.findUnique({ where: { id: input.applicationId } });
  if (!application) {
    throw notFound('APPLICATION_NOT_FOUND', 'Application not found');
  }
  if (application.status === 'declined') {
    throw conflict('APPLICATION_DECLINED', 'This application can no longer book an intro call');
  }

  const existingConfirmed = await prisma.booking.findFirst({
    where: { applicationId: application.id, status: 'confirmed' },
  });
  if (existingConfirmed) {
    throw conflict('BOOKING_EXISTS', 'This application already has a confirmed intro call');
  }

  const [rules, bookings] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { isActive: true } }),
    prisma.booking.findMany({
      where: { status: 'confirmed' },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const offered = isOfferedSlot(rules.map(toSlotRule), bookings, startsAt);
  if (!offered) {
    throw conflict('SLOT_UNAVAILABLE', 'That intro-call slot is no longer available');
  }

  let meetingUrl = config.INTRO_CALL_MEETING_URL;
  let microsoftEventId: string | null = null;
  if (isMicrosoftGraphConfigured()) {
    const meeting = await createIntroCallEvent({
      candidateName: application.fullName,
      candidateEmail: application.email,
      startsAt: offered.startsAt,
      endsAt: offered.endsAt,
    });
    meetingUrl = meeting.joinUrl;
    microsoftEventId = meeting.eventId;
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          applicationId: application.id,
          startsAt: offered.startsAt,
          endsAt: offered.endsAt,
          status: 'confirmed',
          meetingUrl,
          microsoftEventId,
          cancelToken: newCancelToken(),
          confirmedStartsAt: offered.startsAt,
        },
      });

      await tx.application.update({
        where: { id: application.id },
        data: {
          ...(application.status === 'submitted' ? { status: 'booked' } : {}),
          demoScheduledAt: offered.startsAt,
        },
      });
      await tx.applicationActivity.create({
        data: {
          applicationId: application.id,
          type: 'demo_scheduled',
          actor: 'system',
          message: `Intro call booked for ${offered.startsAt.toISOString()}`,
          metadata: { bookingId: created.id, startsAt: offered.startsAt.toISOString() },
        },
      });

      return created;
    });

    await sendBookingConfirmation({
      candidateEmail: application.email,
      candidateName: application.fullName,
      candidateTimezone: application.timezone,
      bookingId: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      meetingUrl: booking.meetingUrl ?? meetingUrl,
      cancelToken: booking.cancelToken,
    });

    if (application.userId) {
      await prisma.accountActivity.create({
        data: {
          userId: application.userId,
          type: 'intro_call_booked',
          message: 'Intro call booked',
        },
      });
    }

    return booking;
  } catch (error) {
    if (microsoftEventId) {
      await cancelIntroCallEvent(microsoftEventId).catch((graphError) => {
        console.error('[graph] failed to roll back intro-call event', graphError);
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('SLOT_UNAVAILABLE', 'That intro-call slot is no longer available');
    }
    throw error;
  }
}

export async function cancelBooking(id: string, token?: string, asAdmin = false) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { application: true },
  });
  if (!booking) {
    throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
  }
  if (!asAdmin && booking.cancelToken !== token) {
    throw forbidden('Invalid cancel token');
  }
  if (booking.status === 'cancelled') {
    return booking;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.booking.update({
      where: { id },
      data: {
        status: 'cancelled',
        confirmedStartsAt: null,
        cancelledAt: new Date(),
      },
      include: { application: true },
    });

    const remaining = await tx.booking.count({
      where: { applicationId: cancelled.applicationId, status: 'confirmed' },
    });

    if (remaining === 0 && cancelled.application.status === 'booked') {
      await tx.application.update({
        where: { id: cancelled.applicationId },
        data: { status: 'submitted' },
      });
    }

    return cancelled;
  });

  await sendBookingCancelled({
    candidateEmail: updated.application.email,
    candidateName: updated.application.fullName,
    candidateTimezone: updated.application.timezone,
    bookingId: updated.id,
    startsAt: updated.startsAt,
    endsAt: updated.endsAt,
    meetingUrl: updated.meetingUrl ?? config.INTRO_CALL_MEETING_URL,
  });

  if (booking.microsoftEventId) {
    await cancelIntroCallEvent(booking.microsoftEventId).catch((error) => {
      console.error('[graph] failed to cancel intro-call event', error);
    });
  }

  return updated;
}

export async function listBookings(input: {
  status?: 'confirmed' | 'cancelled';
  applicationId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.BookingWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    ...(input.from || input.to
      ? {
          startsAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: { application: true },
      orderBy: { startsAt: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}
