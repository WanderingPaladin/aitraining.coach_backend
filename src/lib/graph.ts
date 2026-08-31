import { config } from '../config.js';
import { AppError } from './errors.js';

type GraphEvent = {
  id?: string;
  error?: { message?: string; code?: string };
};

type GraphUser = {
  id?: string;
  error?: { message?: string; code?: string };
};

type GraphOnlineMeeting = {
  id?: string;
  joinUrl?: string | null;
  joinWebUrl?: string | null;
  error?: { message?: string; code?: string };
};

export type IntroCallMeeting = {
  eventId: string;
  joinUrl: string;
};

function graphConfigured(): boolean {
  return Boolean(
    config.MICROSOFT_TENANT_ID &&
      config.MICROSOFT_CLIENT_ID &&
      config.MICROSOFT_CLIENT_SECRET &&
      config.MICROSOFT_COACH_UPN,
  );
}

export function isMicrosoftGraphConfigured(): boolean {
  return graphConfigured();
}

export function graphUtcDateTime(date: Date): string {
  return date.toISOString().slice(0, 19);
}

async function graphToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.MICROSOFT_CLIENT_ID,
    client_secret: config.MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${config.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new AppError(
      502,
      'GRAPH_AUTH_FAILED',
      data.error_description ?? 'Could not authenticate with Microsoft Graph.',
    );
  }
  return data.access_token;
}

async function graphFetch<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new AppError(
      502,
      'GRAPH_REQUEST_FAILED',
      data.error?.message ?? 'Microsoft Graph request failed.',
    );
  }
  return data;
}

function policyHint(message: string): string {
  if (/application access policy|No-one has access|Forbidden/i.test(message)) {
    return `${message} Grant a Teams application access policy to this app for coach@aitrainers.coach.`;
  }
  if (/Insufficient privileges|Authorization_RequestDenied/i.test(message)) {
    return `${message} Add Application permission User.Read.All (admin consent), or set MICROSOFT_COACH_USER_ID to the coach user's Object ID.`;
  }
  return message;
}

async function resolveCoachUserId(token: string): Promise<string> {
  if (config.MICROSOFT_COACH_USER_ID) {
    return config.MICROSOFT_COACH_USER_ID;
  }
  try {
    const user = await graphFetch<GraphUser>(
      `/users/${encodeURIComponent(config.MICROSOFT_COACH_UPN)}?$select=id`,
      { method: 'GET' },
      token,
    );
    if (!user.id) {
      throw new AppError(502, 'GRAPH_COACH_NOT_FOUND', 'Could not resolve the coach Microsoft user id.');
    }
    return user.id;
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(error.statusCode, error.code, policyHint(error.message));
    }
    throw error;
  }
}

export async function createIntroCallEvent(input: {
  candidateName: string;
  candidateEmail: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<IntroCallMeeting> {
  const token = await graphToken();
  const coachUserId = await resolveCoachUserId(token);

  let meeting: GraphOnlineMeeting;
  try {
    meeting = await graphFetch<GraphOnlineMeeting>(
      `/users/${coachUserId}/onlineMeetings`,
      {
        method: 'POST',
        body: JSON.stringify({
          startDateTime: input.startsAt.toISOString(),
          endDateTime: input.endsAt.toISOString(),
          subject: `AI Trainers intro call — ${input.candidateName}`,
        }),
      },
      token,
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(error.statusCode, error.code, policyHint(error.message));
    }
    throw error;
  }

  const joinUrl = meeting.joinUrl ?? meeting.joinWebUrl;
  if (!joinUrl) {
    throw new AppError(
      502,
      'GRAPH_MEETING_MISSING',
      'Microsoft Graph created a meeting but did not return a Teams join link.',
    );
  }

  try {
    const created = await graphFetch<GraphEvent>(
      `/users/${encodeURIComponent(config.MICROSOFT_COACH_UPN)}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          subject: `AI Trainers intro call — ${input.candidateName}`,
          body: {
            contentType: 'HTML',
            content: `<p>Intro call with ${input.candidateName} (${input.candidateEmail}).</p><p><a href="${joinUrl}">Join Microsoft Teams</a></p>`,
          },
          start: { dateTime: graphUtcDateTime(input.startsAt), timeZone: 'UTC' },
          end: { dateTime: graphUtcDateTime(input.endsAt), timeZone: 'UTC' },
          location: { displayName: 'Microsoft Teams' },
          attendees: [
            {
              emailAddress: { address: input.candidateEmail, name: input.candidateName },
              type: 'required',
            },
          ],
        }),
      },
      token,
    );
    if (!created.id) {
      throw new AppError(502, 'GRAPH_EVENT_MISSING', 'Microsoft Graph did not return a calendar event id.');
    }
    return { eventId: created.id, joinUrl };
  } catch (error) {
    if (meeting.id) {
      await graphFetch<void>(
        `/users/${coachUserId}/onlineMeetings/${encodeURIComponent(meeting.id)}`,
        { method: 'DELETE' },
        token,
      ).catch(() => undefined);
    }
    throw error;
  }
}

export async function cancelIntroCallEvent(eventId: string): Promise<void> {
  if (!graphConfigured() || !eventId) {
    return;
  }
  const token = await graphToken();
  await graphFetch<void>(
    `/users/${encodeURIComponent(config.MICROSOFT_COACH_UPN)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
    token,
  );
}
