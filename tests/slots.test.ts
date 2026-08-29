import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { expandSlots, isOfferedSlot, type SlotRule } from '../src/modules/availability/slots.js';

const nyWeekday = (weekday: number, extra?: Partial<SlotRule>): SlotRule => ({
  weekday,
  startTime: '09:00',
  endTime: '17:00',
  timezone: 'America/New_York',
  slotMinutes: 30,
  bufferMinutes: 0,
  ...extra,
});

describe('expandSlots', () => {
  it('emits 30-minute slots for a matching weekday in the rule timezone', () => {
    const monday = DateTime.fromISO('2026-09-14T00:00:00', { zone: 'America/New_York' });
    const now = monday.minus({ days: 1 }).toUTC().toJSDate();
    const slots = expandSlots(
      [nyWeekday(1)],
      [],
      monday.toUTC().toJSDate(),
      monday.endOf('day').toUTC().toJSDate(),
      now,
    );

    expect(slots).toHaveLength(16);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-09-14T13:00:00.000Z');
    expect(slots[0]?.endsAt.toISOString()).toBe('2026-09-14T13:30:00.000Z');
    expect(slots.at(-1)?.startsAt.toISOString()).toBe('2026-09-14T20:30:00.000Z');
  });

  it('skips weekdays that do not match the rule', () => {
    const tuesday = DateTime.fromISO('2026-09-15T00:00:00', { zone: 'America/New_York' });
    const slots = expandSlots(
      [nyWeekday(1)],
      [],
      tuesday.toUTC().toJSDate(),
      tuesday.endOf('day').toUTC().toJSDate(),
      tuesday.minus({ days: 2 }).toUTC().toJSDate(),
    );

    expect(slots).toHaveLength(0);
  });

  it('keeps local 09:00 after the US spring-forward DST change', () => {
    const before = DateTime.fromISO('2026-03-02T00:00:00', { zone: 'America/New_York' });
    const after = DateTime.fromISO('2026-03-09T00:00:00', { zone: 'America/New_York' });
    const now = DateTime.fromISO('2026-03-01T00:00:00Z').toJSDate();

    const beforeSlots = expandSlots(
      [nyWeekday(1)],
      [],
      before.toUTC().toJSDate(),
      before.endOf('day').toUTC().toJSDate(),
      now,
    );
    const afterSlots = expandSlots(
      [nyWeekday(1)],
      [],
      after.toUTC().toJSDate(),
      after.endOf('day').toUTC().toJSDate(),
      now,
    );

    expect(beforeSlots[0]?.startsAt.toISOString()).toBe('2026-03-02T14:00:00.000Z');
    expect(afterSlots[0]?.startsAt.toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });

  it('steps by slot length plus buffer', () => {
    const monday = DateTime.fromISO('2026-09-14T00:00:00', { zone: 'America/New_York' });
    const slots = expandSlots(
      [nyWeekday(1, { endTime: '11:00', bufferMinutes: 15 })],
      [],
      monday.toUTC().toJSDate(),
      monday.endOf('day').toUTC().toJSDate(),
      monday.minus({ days: 1 }).toUTC().toJSDate(),
    );

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-09-14T13:00:00.000Z',
      '2026-09-14T13:45:00.000Z',
      '2026-09-14T14:30:00.000Z',
    ]);
  });

  it('excludes slots that have already started', () => {
    const monday = DateTime.fromISO('2026-09-14T00:00:00', { zone: 'America/New_York' });
    const now = DateTime.fromISO('2026-09-14T13:00:00.000Z').toJSDate();
    const slots = expandSlots(
      [nyWeekday(1, { endTime: '10:30' })],
      [],
      monday.toUTC().toJSDate(),
      monday.endOf('day').toUTC().toJSDate(),
      now,
    );

    expect(slots[0]?.startsAt.toISOString()).toBe('2026-09-14T13:30:00.000Z');
  });

  it('excludes a confirmed booking and honors buffer after it', () => {
    const monday = DateTime.fromISO('2026-09-14T00:00:00', { zone: 'America/New_York' });
    const slots = expandSlots(
      [nyWeekday(1, { endTime: '11:00', bufferMinutes: 15 })],
      [
        {
          startsAt: new Date('2026-09-14T13:00:00.000Z'),
          endsAt: new Date('2026-09-14T13:30:00.000Z'),
        },
      ],
      monday.toUTC().toJSDate(),
      monday.endOf('day').toUTC().toJSDate(),
      monday.minus({ days: 1 }).toUTC().toJSDate(),
    );

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-09-14T13:45:00.000Z',
      '2026-09-14T14:30:00.000Z',
    ]);
  });

  it('dedupes identical slots from overlapping rules', () => {
    const monday = DateTime.fromISO('2026-09-14T00:00:00', { zone: 'America/New_York' });
    const slots = expandSlots(
      [nyWeekday(1, { endTime: '10:00' }), nyWeekday(1, { endTime: '10:00' })],
      [],
      monday.toUTC().toJSDate(),
      monday.endOf('day').toUTC().toJSDate(),
      monday.minus({ days: 1 }).toUTC().toJSDate(),
    );

    expect(slots).toHaveLength(2);
  });

  it('does not emit a slot that would run past the window end', () => {
    const monday = DateTime.fromISO('2026-09-14T00:00:00', { zone: 'America/New_York' });
    const slots = expandSlots(
      [nyWeekday(1, { startTime: '16:45', endTime: '17:00' })],
      [],
      monday.toUTC().toJSDate(),
      monday.endOf('day').toUTC().toJSDate(),
      monday.minus({ days: 1 }).toUTC().toJSDate(),
    );

    expect(slots).toHaveLength(0);
  });
});

describe('isOfferedSlot', () => {
  it('returns the slot when it is still open', () => {
    const startsAt = new Date('2026-09-14T13:00:00.000Z');
    const now = new Date('2026-09-13T00:00:00.000Z');
    const offered = isOfferedSlot([nyWeekday(1)], [], startsAt, now);
    expect(offered?.endsAt.toISOString()).toBe('2026-09-14T13:30:00.000Z');
  });

  it('returns undefined when the slot is booked', () => {
    const startsAt = new Date('2026-09-14T13:00:00.000Z');
    const now = new Date('2026-09-13T00:00:00.000Z');
    const offered = isOfferedSlot(
      [nyWeekday(1)],
      [{ startsAt, endsAt: new Date('2026-09-14T13:30:00.000Z') }],
      startsAt,
      now,
    );
    expect(offered).toBeUndefined();
  });
});
