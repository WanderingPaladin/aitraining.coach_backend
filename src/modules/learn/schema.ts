import { z } from 'zod';
import { COURSE_SLUG } from './questions.js';

const uuid = z.string().uuid();
const optionalUuid = uuid.optional();

export const learnerSituation = z.enum([
  'completely_new',
  'accounts_no_work',
  'assessments_little_work',
  'already_working',
  'researching',
]);

export const progressBody = z.object({
  visitorId: optionalUuid,
  courseSlug: z.literal(COURSE_SLUG).default(COURSE_SLUG),
  currentModule: z.number().int().min(1).max(8).optional(),
  completedModules: z.array(z.number().int().min(1).max(8)).max(8).optional(),
  startedModules: z.array(z.number().int().min(1).max(8)).max(8).optional(),
  quizResults: z.record(z.union([z.boolean(), z.number(), z.string()])).optional(),
  lastLesson: z.string().trim().max(80).optional(),
  completedAt: z.boolean().optional(),
});

export const progressQuery = z.object({
  visitorId: optionalUuid,
  courseSlug: z.literal(COURSE_SLUG).default(COURSE_SLUG),
});

export const startAttemptBody = z.object({
  visitorId: optionalUuid,
  courseSlug: z.literal(COURSE_SLUG).default(COURSE_SLUG),
  attemptId: z.string().cuid().optional(),
  retake: z.boolean().optional().default(false),
});

export const saveAnswersBody = z.object({
  visitorId: optionalUuid,
  answers: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export const submitAttemptBody = z.object({
  visitorId: optionalUuid,
  answers: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().default(''),
  email: z.string().trim().email().max(160),
  usBased: z.boolean(),
  situation: learnerSituation,
  state: z.string().trim().max(2).optional(),
  shareScore: z.boolean().optional().default(false),
  companyWebsite: z.string().max(200).optional(),
});

export const attemptQuery = z.object({
  visitorId: optionalUuid,
});

export type ProgressBody = z.infer<typeof progressBody>;
export type SubmitAttemptBody = z.infer<typeof submitAttemptBody>;
export type SaveAnswersBody = z.infer<typeof saveAnswersBody>;
export type StartAttemptBody = z.infer<typeof startAttemptBody>;
