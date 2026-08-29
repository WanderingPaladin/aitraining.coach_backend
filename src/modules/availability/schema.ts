import { z } from 'zod';
import { isValidIanaTimezone, parseClockTime } from '../../lib/time.js';

const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:mm 24-hour time');

function endAfterStart(startTime: string, endTime: string): boolean {
  const start = parseClockTime(startTime);
  const end = parseClockTime(endTime);
  return end.hour * 60 + end.minute > start.hour * 60 + start.minute;
}

const availabilityRuleShape = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: clockTime,
  endTime: clockTime,
  timezone: z.string().trim().refine(isValidIanaTimezone, 'Invalid IANA timezone'),
  slotMinutes: z.number().int().min(15).max(120).default(30),
  bufferMinutes: z.number().int().min(0).max(60).default(0),
  isActive: z.boolean().default(true),
});

export const availabilityRuleBody = availabilityRuleShape.refine(
  (value) => endAfterStart(value.startTime, value.endTime),
  'endTime must be after startTime',
);

export const patchAvailabilityBody = availabilityRuleShape.partial().refine((value) => {
  if (!value.startTime || !value.endTime) {
    return true;
  }
  return endAfterStart(value.startTime, value.endTime);
}, 'endTime must be after startTime');

export const availabilityIdParams = z.object({
  id: z.string().min(1),
});

export const slotsQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().trim().refine(isValidIanaTimezone, 'Invalid IANA timezone').default('UTC'),
});

export type AvailabilityRuleBody = z.infer<typeof availabilityRuleBody>;
export type PatchAvailabilityBody = z.infer<typeof patchAvailabilityBody>;
