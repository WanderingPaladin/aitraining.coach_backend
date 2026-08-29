import type { AvailabilityRule } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { inZone } from '../../lib/time.js';
import { expandSlots, type SlotRule } from './slots.js';
import type { AvailabilityRuleBody, PatchAvailabilityBody } from './schema.js';

const MAX_RANGE_DAYS = 31;
const DEFAULT_RANGE_DAYS = 14;

export function toSlotRule(rule: AvailabilityRule): SlotRule {
  return {
    weekday: rule.weekday,
    startTime: rule.startTime,
    endTime: rule.endTime,
    timezone: rule.timezone,
    slotMinutes: rule.slotMinutes,
    bufferMinutes: rule.bufferMinutes,
  };
}

export function serializeAvailabilityRule(rule: AvailabilityRule) {
  return {
    id: rule.id,
    weekday: rule.weekday,
    startTime: rule.startTime,
    endTime: rule.endTime,
    timezone: rule.timezone,
    slotMinutes: rule.slotMinutes,
    bufferMinutes: rule.bufferMinutes,
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export async function listAvailabilityRules() {
  return prisma.availabilityRule.findMany({ orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
}

export async function createAvailabilityRule(input: AvailabilityRuleBody) {
  return prisma.availabilityRule.create({ data: input });
}

export async function updateAvailabilityRule(id: string, input: PatchAvailabilityBody) {
  const existing = await prisma.availabilityRule.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('AVAILABILITY_NOT_FOUND', 'Availability rule not found');
  }
  return prisma.availabilityRule.update({ where: { id }, data: input });
}

export async function deleteAvailabilityRule(id: string) {
  const existing = await prisma.availabilityRule.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('AVAILABILITY_NOT_FOUND', 'Availability rule not found');
  }
  await prisma.availabilityRule.delete({ where: { id } });
}

export async function listOpenSlots(input: { from?: string; to?: string; timezone: string }) {
  const now = new Date();
  const rangeStart = input.from ? new Date(input.from) : now;
  const rangeEnd = input.to
    ? new Date(input.to)
    : DateTime.fromJSDate(rangeStart).plus({ days: DEFAULT_RANGE_DAYS }).toJSDate();

  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    throw badRequest('INVALID_RANGE', 'from and to must be valid datetimes');
  }
  if (rangeEnd <= rangeStart) {
    throw badRequest('INVALID_RANGE', 'to must be after from');
  }

  const rangeDays = (rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw badRequest('RANGE_TOO_LARGE', `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  const [rules, bookings] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { isActive: true } }),
    prisma.booking.findMany({
      where: {
        status: 'confirmed',
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const slots = expandSlots(rules.map(toSlotRule), bookings, rangeStart, rangeEnd, now);

  return slots.map((slot) => {
    const localStart = inZone(slot.startsAt, input.timezone);
    const localEnd = inZone(slot.endsAt, input.timezone);
    return {
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      local: {
        timezone: input.timezone,
        startsAt: localStart.toISO(),
        endsAt: localEnd.toISO(),
        label: localStart.toFormat("ccc, LLL d, yyyy, t"),
      },
    };
  });
}
