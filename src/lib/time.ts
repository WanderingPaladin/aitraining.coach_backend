import { DateTime, IANAZone } from 'luxon';

export function isValidIanaTimezone(value: string): boolean {
  return IANAZone.isValidZone(value);
}

export function assertIanaTimezone(value: string): string {
  if (!isValidIanaTimezone(value)) {
    throw new Error(`Invalid IANA timezone: ${value}`);
  }
  return value;
}

export function parseClockTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid clock time: ${value}`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** JS weekday: 0 = Sunday … 6 = Saturday */
export function jsWeekdayFromLuxon(date: DateTime): number {
  return date.weekday === 7 ? 0 : date.weekday;
}

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

export function inZone(date: Date, timezone: string): DateTime {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone);
}
