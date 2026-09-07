import { z } from 'zod';
import { isValidEmailAddress } from '../../lib/apply-fields.js';
import { CHAT_QUALITY_COPY, chatMessageIssue } from './quality.js';

export const chatStatuses = ['open', 'waiting_for_team', 'waiting_for_user', 'resolved', 'closed'] as const;

const optionalId = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, 80);
  });

function optionalString(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, max);
    });
}

export const visitorChatQuery = z.object({
  visitorId: optionalId.optional(),
});

export const sendChatMessageBody = z
  .object({
    body: z.string().optional().default(''),
    visitorId: optionalId.optional(),
    sessionId: optionalId.optional(),
    pagePath: optionalString(200).optional(),
    pageUrl: optionalString(500).optional(),
    topic: optionalString(80).optional(),
    conversationId: optionalId.optional(),
  })
  .superRefine((value, ctx) => {
    const issue = chatMessageIssue(value.body ?? '');
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: CHAT_QUALITY_COPY[issue],
      });
    }
  });

export const conversationIdParams = z.object({
  id: z.string().cuid('Invalid cuid'),
});

export const listMessagesQuery = z.object({
  visitorId: optionalId.optional(),
  before: optionalId.optional(),
  limit: z.coerce.number().int().min(1).max(80).default(40),
});

export const contactEmailBody = z.object({
  visitorId: optionalId.optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => isValidEmailAddress(value), 'Enter a valid email address'),
});

export const socketTokenBody = z.object({
  visitorId: optionalId.optional(),
});

export const openedBody = z.object({
  visitorId: optionalId.optional(),
  sessionId: optionalId.optional(),
});

export const listAdminConversationsQuery = z.object({
  status: z.union([z.enum(chatStatuses), z.literal('all'), z.literal('unread')]).optional().default('all'),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const patchConversationBody = z.object({
  status: z.enum(chatStatuses),
});

export const adminReplyBody = z
  .object({
    body: z.string().optional().default(''),
  })
  .superRefine((value, ctx) => {
    const issue = chatMessageIssue(value.body ?? '');
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: CHAT_QUALITY_COPY[issue],
      });
    }
  });

export type SendChatMessageBody = z.infer<typeof sendChatMessageBody>;
export type ListAdminConversationsQuery = z.infer<typeof listAdminConversationsQuery>;
