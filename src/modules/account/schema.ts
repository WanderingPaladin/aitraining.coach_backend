import { z } from 'zod';
import {
  isValidCityName,
  isValidE164Phone,
  professions,
  usStateCodes,
} from '../../lib/apply-fields.js';
import { isValidIanaTimezone } from '../../lib/time.js';
import { applicantStageSchema } from '../applications/schema.js';

const stringList = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) => {
    if (value == null) {
      return undefined;
    }
    const items = (Array.isArray(value) ? value : value.split(','))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 24);
    return items;
  });

export const patchProfileBody = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .nullish()
    .refine((value) => !value || isValidE164Phone(value), 'Enter a real phone number with country code'),
  city: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .refine((value) => !value || isValidCityName(value), 'Enter a valid city name'),
  state: z
    .string()
    .trim()
    .nullish()
    .refine((value) => !value || (usStateCodes as readonly string[]).includes(value), 'Select a valid state'),
  profession: z
    .string()
    .trim()
    .nullish()
    .refine((value) => !value || (professions as readonly string[]).includes(value), 'Select a profession'),
  timezone: z
    .string()
    .trim()
    .nullish()
    .refine((value) => !value || isValidIanaTimezone(value), 'Enter a valid timezone'),
  applicantStage: applicantStageSchema.optional().nullable(),
  yearsOfAiTraining: z.coerce.number().int().min(0).max(40).optional(),
  usEligibilityConfirmed: z.boolean().optional(),
  yearsDomainExperience: z.coerce.number().int().min(0).max(50).optional().nullable(),
  specialties: stringList,
  skills: stringList,
  educationLevel: z.string().trim().max(120).optional().nullable(),
  desiredCategories: stringList,
  weeklyAvailability: z.string().trim().max(80).optional().nullable(),
  platformsJoined: stringList,
  platformStatus: z.string().trim().max(40).optional().nullable(),
  remotePreference: z.string().trim().max(40).optional().nullable(),
  languages: stringList,
});
