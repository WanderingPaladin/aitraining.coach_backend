import { z } from 'zod';
import {
  isValidCityName,
  isValidE164Phone,
  isValidEmailAddress,
  isValidExperienceYears,
  professions,
  usStateCodes,
} from '../../lib/apply-fields.js';
import { isValidIanaTimezone } from '../../lib/time.js';

export const applicationPathSchema = z.enum(['new_professional', 'current_trainer']);

export const applicationStatusSchema = z.enum([
  'submitted',
  'booked',
  'reviewed',
  'advanced',
  'declined',
]);

export const pipelineStageSchema = z.enum([
  'NEW',
  'REVIEWING',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'QUALIFIED',
  'ONBOARDING',
  'REJECTED',
  'ARCHIVED',
]);

export const applicantStageSchema = z.enum([
  'new_no_account',
  'has_accounts_no_time',
  'working_no_progress',
]);

function csvEnumList<T extends string>(schema: z.ZodEnum<[T, ...T[]]>) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }
      const parsed = value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => schema.parse(part));
      return parsed.length > 0 ? parsed : undefined;
    });
}

export const createApplicationBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(isValidEmailAddress, 'Enter a valid email address, like you@company.com.'),
  phone: z
    .string()
    .trim()
    .refine(isValidE164Phone, 'Enter a real phone number with country code'),
  city: z
    .string()
    .trim()
    .max(80)
    .refine(isValidCityName, 'Enter a valid city name'),
  state: z.enum(usStateCodes, { errorMap: () => ({ message: 'Select a valid state' }) }),
  profession: z.enum(professions, { errorMap: () => ({ message: 'Select a profession' }) }),
  yearsOfExperience: z.coerce
    .number()
    .int()
    .refine(isValidExperienceYears, 'Select years of AI training'),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidIanaTimezone, 'Invalid IANA timezone')
    .optional()
    .default('UTC'),
  ipAddress: z.string().trim().max(64).optional(),
  ipLocation: z.string().trim().max(2000).optional(),
  applicant_stage: applicantStageSchema,
  referral_source: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  us_eligibility_confirmed: z.literal(true, {
    errorMap: () => ({
      message: 'Please confirm that you meet the current U.S. eligibility requirement.',
    }),
  }),
});

const optionalDatetime = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();

export const listApplicationsQuery = z.object({
  status: applicationStatusSchema.optional(),
  stage: csvEnumList(pipelineStageSchema),
  applicantStage: csvEnumList(applicantStageSchema),
  profession: z.string().trim().max(80).optional(),
  experienceMin: z.coerce.number().int().min(0).max(4).optional(),
  experienceMax: z.coerce.number().int().min(0).max(4).optional(),
  state: z.string().trim().max(2).optional(),
  assignee: z.string().trim().max(80).optional(),
  unassigned: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  tag: z.string().trim().max(40).optional(),
  submittedFrom: z.string().datetime({ offset: true }).optional(),
  submittedTo: z.string().datetime({ offset: true }).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((value) => value === undefined || isValidEmailAddress(value), 'Enter a valid email address'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  ids: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.split(',').map((id) => id.trim()).filter(Boolean) : undefined)),
});

export const patchApplicationBody = z.object({
  status: applicationStatusSchema.optional(),
  pipelineStage: pipelineStageSchema.optional(),
  assignee: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  addTag: z.string().trim().max(40).optional(),
  nextActionAt: optionalDatetime,
  demoScheduledAt: optionalDatetime,
});

export const bulkApplicationsBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  pipelineStage: pipelineStageSchema.optional(),
  assignee: z.string().trim().max(80).nullable().optional(),
  addTag: z.string().trim().max(40).optional(),
  archive: z.boolean().optional(),
});

export const createNoteBody = z.object({
  body: z.string().min(1).max(8000),
});

export const loginBody = z.object({
  password: z.string().min(1).max(200),
});

export const applicationIdParams = z.object({
  id: z.string().min(1),
});

export type CreateApplicationBody = z.infer<typeof createApplicationBody>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuery>;
export type PatchApplicationBody = z.infer<typeof patchApplicationBody>;
export type BulkApplicationsBody = z.infer<typeof bulkApplicationsBody>;
export type PipelineStageValue = z.infer<typeof pipelineStageSchema>;
