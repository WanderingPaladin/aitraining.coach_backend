function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export type IcsAttendee = {
  name: string;
  email: string;
  role?: 'ORGANIZER' | 'REQ-PARTICIPANT';
  partStat?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED';
};

export function buildInviteIcs(input: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  location: string;
  organizer: IcsAttendee;
  attendees: IcsAttendee[];
  method?: 'REQUEST' | 'CANCEL';
  sequence?: number;
}): string {
  const method = input.method ?? 'REQUEST';
  const sequence = input.sequence ?? (method === 'CANCEL' ? 1 : 0);
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  const stamp = icsTimestamp(new Date());

  const attendeeLines = input.attendees.map((attendee) => {
    const partStat = attendee.partStat ?? (method === 'CANCEL' ? 'DECLINED' : 'NEEDS-ACTION');
    const role = attendee.role ?? 'REQ-PARTICIPANT';
    return `ATTENDEE;CN=${escapeIcsText(attendee.name)};ROLE=${role};PARTSTAT=${partStat};RSVP=TRUE:mailto:${attendee.email}`;
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Trainers//Intro Call//EN',
    `METHOD:${method}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTimestamp(input.startsAt)}`,
    `DTEND:${icsTimestamp(input.endsAt)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    `ORGANIZER;CN=${escapeIcsText(input.organizer.name)}:mailto:${input.organizer.email}`,
    ...attendeeLines,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
