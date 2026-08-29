import { DateTime } from 'luxon';
import { jsWeekdayFromLuxon, parseClockTime } from '../../lib/time.js';

export type SlotRule = {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
};

export type OccupiedInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type TimeSlot = {
  startsAt: Date;
  endsAt: Date;
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function occupiedUntil(booking: OccupiedInterval, bufferMinutes: number): Date {
  return new Date(booking.endsAt.getTime() + bufferMinutes * 60_000);
}

export function expandSlots(
  rules: SlotRule[],
  bookings: OccupiedInterval[],
  rangeStart: Date,
  rangeEnd: Date,
  now = new Date(),
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  for (const rule of rules) {
    const startClock = parseClockTime(rule.startTime);
    const endClock = parseClockTime(rule.endTime);
    const stepMinutes = rule.slotMinutes + rule.bufferMinutes;

    let day = DateTime.fromJSDate(rangeStart, { zone: rule.timezone }).startOf('day');
    const lastDay = DateTime.fromJSDate(rangeEnd, { zone: rule.timezone }).startOf('day');

    for (; day <= lastDay; day = day.plus({ days: 1 })) {
      if (jsWeekdayFromLuxon(day) !== rule.weekday) {
        continue;
      }

      let cursor = day.set({
        hour: startClock.hour,
        minute: startClock.minute,
        second: 0,
        millisecond: 0,
      });
      const windowEnd = day.set({
        hour: endClock.hour,
        minute: endClock.minute,
        second: 0,
        millisecond: 0,
      });

      while (cursor.plus({ minutes: rule.slotMinutes }) <= windowEnd) {
        const slotStart = cursor.toUTC().toJSDate();
        const slotEnd = cursor.plus({ minutes: rule.slotMinutes }).toUTC().toJSDate();

        const inFuture = slotStart.getTime() > now.getTime();
        const taken = bookings.some((booking) =>
          overlaps(slotStart, slotEnd, booking.startsAt, occupiedUntil(booking, rule.bufferMinutes)),
        );

        if (inFuture && !taken) {
          slots.push({ startsAt: slotStart, endsAt: slotEnd });
        }

        cursor = cursor.plus({ minutes: stepMinutes });
      }
    }
  }

  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const unique: TimeSlot[] = [];
  for (const slot of slots) {
    if (slot.startsAt < rangeStart || slot.startsAt >= rangeEnd) {
      continue;
    }
    const previous = unique[unique.length - 1];
    if (!previous || previous.startsAt.getTime() !== slot.startsAt.getTime()) {
      unique.push(slot);
    }
  }

  return unique;
}

export function isOfferedSlot(
  rules: SlotRule[],
  bookings: OccupiedInterval[],
  startsAt: Date,
  now = new Date(),
): TimeSlot | undefined {
  const rangeStart = new Date(startsAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(startsAt.getTime() + 12 * 60 * 60 * 1000);
  return expandSlots(rules, bookings, rangeStart, rangeEnd, now).find(
    (slot) => slot.startsAt.getTime() === startsAt.getTime(),
  );
}
