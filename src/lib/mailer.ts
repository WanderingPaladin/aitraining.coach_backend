import { config, mailFrom } from '../config.js';
import {
  createCoachNoticeEvent,
  isMicrosoftGraphConfigured,
  sendCoachMail,
} from './graph.js';
import { buildInviteIcs, type IcsAttendee } from './ics.js';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  ics?: { filename: string; content: string; method: 'REQUEST' | 'CANCEL' };
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    console.info('[mail:dev]', {
      to: message.to,
      subject: message.subject,
      text: message.text,
      ics: message.ics?.filename,
    });
  }
}

class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  async send(message: MailMessage): Promise<void> {
    const { Resend } = await import('resend');
    const resend = new Resend(this.apiKey);

    const { error } = await resend.emails.send({
      from: config.MAIL_FROM,
      to: message.to,
      replyTo: message.replyTo ?? config.COACH_EMAIL,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.ics
        ? [
            {
              filename: message.ics.filename,
              content: Buffer.from(message.ics.content, 'utf8'),
              contentType: `text/calendar; method=${message.ics.method}; charset=UTF-8`,
            },
          ]
        : undefined,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

export const mailer: Mailer = config.RESEND_API_KEY
  ? new ResendMailer(config.RESEND_API_KEY)
  : new ConsoleMailer();

export async function sendSafely(message: MailMessage): Promise<void> {
  try {
    await mailer.send(message);
  } catch (error) {
    console.error('[mail] failed to send', message.subject, error);
    if (process.env.MAIL_THROW === '1') {
      throw error;
    }
  }
}

async function sendCoachSafely(
  message: { subject: string; text: string; html: string; replyTo?: string },
  options?: { calendarFallback?: boolean },
): Promise<void> {
  if (isMicrosoftGraphConfigured()) {
    try {
      await sendCoachMail(message);
      return;
    } catch (error) {
      console.error('[mail] graph coach send failed', message.subject, error);
      if (options?.calendarFallback) {
        await createCoachNoticeEvent({
          subject: message.subject,
          html: message.html,
        }).catch((fallbackError) => {
          console.error('[mail] graph coach calendar fallback failed', fallbackError);
        });
      }
      if (process.env.MAIL_THROW === '1') {
        throw error;
      }
      return;
    }
  }

  await sendSafely({
    to: config.COACH_EMAIL,
    ...message,
  });
}

export async function notifyCoach(
  message: { subject: string; text: string; html: string; replyTo?: string },
): Promise<void> {
  await sendCoachSafely(message);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWhen(startsAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(startsAt);
}

function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;padding:24px;font-family:Georgia,serif;color:#12213a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:18px;">
      <p style="margin:0 0 8px;color:#1687FF;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px;">AI Trainers</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:28px 0 0;color:#667085;font-size:13px;">— AI Trainers</p>
    </div>
  </body>
</html>`;
}

function organizer(): IcsAttendee {
  return { name: mailFrom.name, email: mailFrom.email };
}

function introCallIcs(input: {
  bookingId: string;
  candidateName: string;
  candidateEmail: string;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string;
  method: 'REQUEST' | 'CANCEL';
}): string {
  return buildInviteIcs({
    uid: `${input.bookingId}@aitrainers.coach`,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    summary: 'AI Trainers intro call',
    description: `Intro call with ${input.candidateName}. Join: ${input.meetingUrl}`,
    location: input.meetingUrl,
    organizer: organizer(),
    attendees: [
      {
        name: input.candidateName,
        email: input.candidateEmail,
        partStat: input.method === 'CANCEL' ? 'DECLINED' : 'NEEDS-ACTION',
      },
      {
        name: mailFrom.name,
        email: config.COACH_EMAIL,
        partStat: input.method === 'CANCEL' ? 'DECLINED' : 'ACCEPTED',
      },
    ],
    method: input.method,
    sequence: input.method === 'CANCEL' ? 1 : 0,
  });
}

export type ApplicationReceivedInput = {
  email: string;
  firstName: string;
  fullName: string;
  phone: string;
  city: string;
  state: string;
  profession: string;
  experience: string;
  situation: string | null;
  referralSource: string | null;
  timezone: string;
  usEligible: boolean;
  ipLocation: string | null;
};

function applicationDetailRows(input: ApplicationReceivedInput): [string, string][] {
  const rows: [string, string][] = [
    ['Name', input.fullName],
    ['Email', input.email],
    ['Phone', input.phone],
    ['Location', `${input.city}, ${input.state}`],
    ['Profession', input.profession],
    ['AI training experience', input.experience],
    ['Situation', input.situation ?? '—'],
    ['How they heard about us', input.referralSource ?? '—'],
    ['Timezone', input.timezone],
    ['U.S. eligible', input.usEligible ? 'Yes' : 'No'],
  ];
  if (input.ipLocation) {
    rows.push(['IP location', input.ipLocation]);
  }
  return rows;
}

export async function sendApplicationReceived(input: ApplicationReceivedInput): Promise<void> {
  const title = 'We received your application';
  const text = `Hi ${input.firstName},\n\nThanks for applying to AI Trainers. We received your application and will review it shortly.\n\nThe next step is to book a free intro call if you have not already.\n\n— AI Trainers`;

  await sendSafely({
    to: input.email,
    subject: 'We received your AI Trainers application',
    text,
    html: emailLayout(
      title,
      `<p>Hi ${escapeHtml(input.firstName)},</p>
       <p>Thanks for applying to AI Trainers. We received your application and will review it shortly.</p>
       <p>The next step is to book a free intro call if you have not already.</p>`,
    ),
  });

  const rows = applicationDetailRows(input);
  const coachText = [
    `${input.fullName} submitted an application.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
  ].join('\n');
  const coachHtml = rows
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:6px 12px 6px 0;color:#667085;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
           <td style="padding:6px 0;vertical-align:top;">${escapeHtml(value)}</td>
         </tr>`,
    )
    .join('');

  await sendCoachSafely(
    {
      replyTo: input.email,
      subject: `New application: ${input.fullName}`,
      text: coachText,
      html: emailLayout(
        'New application submitted',
        `<p><strong>${escapeHtml(input.fullName)}</strong> submitted an application. Reply to this email to reach them at ${escapeHtml(input.email)}.</p>
       <table style="border-collapse:collapse;margin-top:12px;">${coachHtml}</table>`,
      ),
    },
    { calendarFallback: true },
  );
}

export async function sendBookingConfirmation(input: {
  candidateEmail: string;
  candidateName: string;
  candidateTimezone: string;
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string;
  cancelToken: string;
}): Promise<void> {
  const when = formatWhen(input.startsAt, input.candidateTimezone);
  const ics = introCallIcs({ ...input, method: 'REQUEST' });
  const icsAttachment = {
    filename: 'intro-call.ics',
    content: ics,
    method: 'REQUEST' as const,
  };

  const candidateText = `Hi ${input.candidateName},\n\nYour intro call is booked for ${when} (${input.candidateTimezone}).\n\nJoin: ${input.meetingUrl}\n\nIf you need to cancel, send a POST to /v1/bookings/${input.bookingId}/cancel with { "token": "${input.cancelToken}" }.\n\n— AI Trainers`;

  await sendSafely({
    to: input.candidateEmail,
    subject: 'Your AI Trainers intro call is booked',
    text: candidateText,
    html: emailLayout(
      'Your intro call is booked',
      `<p>Hi ${escapeHtml(input.candidateName)},</p>
       <p>Your intro call is booked for <strong>${escapeHtml(when)}</strong> (${escapeHtml(input.candidateTimezone)}).</p>
       <p><a href="${escapeHtml(input.meetingUrl)}">Join the call</a></p>
       <p style="color:#667085;font-size:13px;">A calendar invite is attached. Add it to keep the time on your calendar.</p>`,
    ),
    ics: icsAttachment,
  });

  await sendCoachSafely(
    {
      replyTo: input.candidateEmail,
      subject: `Intro call booked: ${input.candidateName}`,
      text: `${input.candidateName} (${input.candidateEmail}) booked an intro call for ${when}.\n\nJoin: ${input.meetingUrl}\nBooking: ${input.bookingId}\n`,
      html: emailLayout(
        'New intro call booked',
        `<p><strong>${escapeHtml(input.candidateName)}</strong> (${escapeHtml(input.candidateEmail)}) booked an intro call.</p>
       <p><strong>${escapeHtml(when)}</strong> (${escapeHtml(input.candidateTimezone)})</p>
       <p><a href="${escapeHtml(input.meetingUrl)}">Join the call</a></p>
       <p style="color:#667085;font-size:13px;">Booking ID: ${escapeHtml(input.bookingId)}</p>`,
      ),
    },
    { calendarFallback: true },
  );
}

export async function sendBookingCancelled(input: {
  candidateEmail: string;
  candidateName: string;
  candidateTimezone: string;
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string;
}): Promise<void> {
  const when = formatWhen(input.startsAt, input.candidateTimezone);
  const ics = introCallIcs({ ...input, method: 'CANCEL' });
  const icsAttachment = {
    filename: 'intro-call-cancelled.ics',
    content: ics,
    method: 'CANCEL' as const,
  };

  await sendSafely({
    to: input.candidateEmail,
    subject: 'Your AI Trainers intro call was cancelled',
    text: `Hi ${input.candidateName},\n\nYour intro call for ${when} has been cancelled. You can book a new slot anytime.\n\n— AI Trainers`,
    html: emailLayout(
      'Your intro call was cancelled',
      `<p>Hi ${escapeHtml(input.candidateName)},</p>
       <p>Your intro call for <strong>${escapeHtml(when)}</strong> has been cancelled. You can book a new slot anytime.</p>`,
    ),
    ics: icsAttachment,
  });

  await sendCoachSafely(
    {
      replyTo: input.candidateEmail,
      subject: `Intro call cancelled: ${input.candidateName}`,
      text: `${input.candidateName} (${input.candidateEmail}) cancelled the intro call for ${when}.\nBooking: ${input.bookingId}\n`,
      html: emailLayout(
        'Intro call cancelled',
        `<p><strong>${escapeHtml(input.candidateName)}</strong> (${escapeHtml(input.candidateEmail)}) cancelled the intro call for <strong>${escapeHtml(when)}</strong>.</p>
       <p style="color:#667085;font-size:13px;">Booking ID: ${escapeHtml(input.bookingId)}</p>`,
      ),
    },
    { calendarFallback: true },
  );
}
