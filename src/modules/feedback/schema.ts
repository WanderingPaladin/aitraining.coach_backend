import { z } from 'zod';
import { isValidEmailAddress } from '../../lib/apply-fields.js';

export const feedbackCategories = [
  'confusing',
  'improvement',
  'problem',
  'general',
  'question',
] as const;

export const feedbackStatuses = ['new', 'reviewed', 'planned', 'resolved', 'archived'] as const;

export const feedbackDeviceTypes = ['desktop', 'tablet', 'mobile'] as const;

export const feedbackSubcategories = [
  'how_it_works',
  'apply',
  'book_call',
  'opportunities',
  'profile',
  'profile_match',
  'navigation',
  'application',
  'booking',
  'coaching',
  'page_not_loading',
  'button_not_working',
  'form_issue',
  'booking_issue',
  'login_account',
  'opportunity_issue',
  'visual_layout',
  'other',
] as const;

const optionalEmail = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => value == null || isValidEmailAddress(value), 'Enter a valid email address');

function optionalBoundedString(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, max);
    });
}

const optionalInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed);
  })
  .refine((value) => value == null || (value >= 0 && value <= 10000), 'Invalid screen size');

export const createFeedbackBody = z
  .object({
    category: z.enum(feedbackCategories),
    subcategory: z
      .union([z.enum(feedbackSubcategories), z.null(), z.undefined(), z.literal('')])
      .optional()
      .transform((value) => (value ? value : null)),
    message: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((value) => (value ?? '').slice(0, 2000)),
    rating: z
      .union([z.number(), z.string(), z.null(), z.undefined()])
      .transform((value) => {
        if (value == null || value === '') return null;
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
      })
      .refine((value) => value == null || (value >= 1 && value <= 4), 'Rating must be between 1 and 4'),
    pagePath: z.string().trim().max(200).optional().default('/'),
    pageUrl: optionalBoundedString(500),
    email: optionalEmail,
    metadata: z
      .object({
        browser: optionalBoundedString(80).optional(),
        deviceType: z
          .union([z.enum(feedbackDeviceTypes), z.null(), z.undefined(), z.literal('')])
          .optional()
          .transform((value) => (value ? value : null)),
        screenWidth: optionalInt.optional(),
        screenHeight: optionalInt.optional(),
        referrer: optionalBoundedString(500).optional(),
      })
      .optional()
      .default({}),
  })
  .superRefine((value, ctx) => {
    const message = value.message.trim();
    if (!message && value.rating == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: 'Share a short comment or a rating.',
      });
    }
  });

export const listFeedbackQuery = z.object({
  status: z.enum(feedbackStatuses).optional(),
  category: z.enum(feedbackCategories).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const feedbackIdParams = z.object({
  id: z.string().min(1).max(40),
});

export const patchFeedbackBody = z.object({
  status: z.enum(feedbackStatuses),
});

export type CreateFeedbackBody = z.infer<typeof createFeedbackBody>;
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuery>;
