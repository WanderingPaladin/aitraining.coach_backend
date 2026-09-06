import { z } from 'zod';
import { PUBLIC_EVENT_TYPES } from './types.js';

const uuid = z.string().uuid();
const optionalUuid = uuid.optional();
const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value ? value : undefined));

export const trackSessionBody = z.object({
  visitorId: uuid,
  sessionId: uuid,
  landingPage: z.string().trim().max(300).optional(),
  referrer: optionalText,
  utmSource: z.string().trim().max(80).optional(),
  utmMedium: z.string().trim().max(80).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
  utmContent: z.string().trim().max(120).optional(),
  utmTerm: z.string().trim().max(120).optional(),
  deviceType: z.enum(['desktop', 'tablet', 'mobile']).optional(),
  browser: z.string().trim().max(40).optional(),
});

export const publicTrackEvent = z.object({
  eventType: z.enum(PUBLIC_EVENT_TYPES),
  pagePath: z.string().trim().max(300).optional(),
  applicationId: optionalUuid,
  opportunityId: z.string().trim().max(80).optional(),
  platform: z.string().trim().max(80).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export const trackEventsBody = z.object({
  visitorId: uuid,
  sessionId: uuid,
  events: z.array(publicTrackEvent).min(1).max(20),
});

export const analyticsQuery = z.object({
  range: z.enum(['today', '7d', '30d', '90d', 'all', 'custom']).default('30d'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const introCallAttendanceSchema = z.enum([
  'scheduled',
  'rescheduled',
  'cancelled',
  'attended',
  'no_show',
  'completed',
]);

export const patchIntroCallBody = z.object({
  attendance: introCallAttendanceSchema,
});

export const platformProgressStatusSchema = z.enum([
  'interested',
  'applied',
  'assessment_invited',
  'assessment_started',
  'assessment_completed',
  'interview_invited',
  'interview_scheduled',
  'interview_completed',
  'passed',
  'rejected',
  'waitlisted',
  'project_received',
  'working',
  'inactive',
]);

export const upsertPlatformProgressBody = z.object({
  platform: z.string().trim().min(1).max(80),
  opportunityId: z.string().trim().max(80).optional(),
  opportunityTitle: z.string().trim().max(160).optional(),
  status: platformProgressStatusSchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type TrackSessionBody = z.infer<typeof trackSessionBody>;
export type TrackEventsBody = z.infer<typeof trackEventsBody>;
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;
export type UpsertPlatformProgressBody = z.infer<typeof upsertPlatformProgressBody>;
export type PatchIntroCallBody = z.infer<typeof patchIntroCallBody>;
