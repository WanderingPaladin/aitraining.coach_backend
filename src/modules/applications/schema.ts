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
  applicant_stage: z.enum(['new_no_account', 'has_accounts_no_time', 'working_no_progress']),
  referral_source: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const listApplicationsQuery = z.object({
  status: applicationStatusSchema.optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((value) => value === undefined || isValidEmailAddress(value), 'Enter a valid email address'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
});

export const patchApplicationBody = z.object({
  status: applicationStatusSchema,
});

export const applicationIdParams = z.object({
  id: z.string().min(1),
});

export type CreateApplicationBody = z.infer<typeof createApplicationBody>;
