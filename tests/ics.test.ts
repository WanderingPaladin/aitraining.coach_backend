import { describe, expect, it } from 'vitest';
import { buildInviteIcs } from '../src/lib/ics.js';

describe('buildInviteIcs', () => {
  const base = {
    uid: 'booking-123@aitrainers.coach',
    startsAt: new Date('2026-09-14T13:00:00.000Z'),
    endsAt: new Date('2026-09-14T13:30:00.000Z'),
    summary: 'AI Trainers intro call',
    description: 'Join: https://meet.google.com/abc-defg-hij',
    location: 'https://meet.google.com/abc-defg-hij',
    organizer: { name: 'AI Trainers', email: 'hello@aitrainers.coach' },
    attendees: [
      { name: 'Priya Shah', email: 'priya@example.com' },
      { name: 'AI Trainers', email: 'hello@aitrainers.coach', partStat: 'ACCEPTED' as const },
    ],
  };

  it('builds a REQUEST invite with organizer and attendees', () => {
    const ics = buildInviteIcs({ ...base, method: 'REQUEST' });

    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('UID:booking-123@aitrainers.coach');
    expect(ics).toContain('DTSTART:20260914T130000Z');
    expect(ics).toContain('DTEND:20260914T133000Z');
    expect(ics).toContain('ORGANIZER;CN=AI Trainers:mailto:hello@aitrainers.coach');
    expect(ics).toContain('ATTENDEE;CN=Priya Shah');
    expect(ics).toContain('mailto:priya@example.com');
  });

  it('builds a CANCEL invite with the same UID and a bumped sequence', () => {
    const ics = buildInviteIcs({ ...base, method: 'CANCEL' });

    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('UID:booking-123@aitrainers.coach');
  });

  it('escapes commas and semicolons in text fields', () => {
    const ics = buildInviteIcs({
      ...base,
      summary: 'Intro call, with Priya',
      description: 'Notes; bring resume',
    });

    expect(ics).toContain('SUMMARY:Intro call\\, with Priya');
    expect(ics).toContain('DESCRIPTION:Notes\\; bring resume');
  });
});
