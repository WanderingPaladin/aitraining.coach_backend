import { z } from 'zod';
import { CHAT_QUALITY_COPY, chatMessageIssue, MAX_MESSAGE } from './quality.js';

export const chatConversationStatuses = [
  'open',
  'waiting_for_team',
  'waiting_for_user',
  'resolved',
  'closed',
] as const;

export const chatTopics = [
  'getting_started',
  'opportunities',
  'application',
  'booking',
  'profile_match',
  'something_else',
] as const;

const optionalBounded = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalUuid = z
  .string()
  .trim()
  .uuid()
  .optional()
  .or(z.literal('').transform(() => undefined));

export const getChatQuery = z.object({
  visitorId: optionalUuid,
  sessionId: optionalUuid,
});

export const createChatMessageBody = z
  .object({
    conversationId: z.string().trim().cuid().optional(),
    visitorId: optionalUuid,
    sessionId: optionalUuid,
    body: z.string().max(MAX_MESSAGE + 20).default(''),
    topic: z.enum(chatTopics).optional(),
    pagePath: optionalBounded(200),
    pageUrl: optionalBounded(500),
    contextType: optionalBounded(40),
    opportunityId: optionalBounded(80),
    opportunityTitle: optionalBounded(180),
    opportunityPlatform: optionalBounded(80),
    companyWebsite: optionalBounded(200),
  })
  .superRefine((value, ctx) => {
    if (value.companyWebsite) {
      return;
    }
    const issue = chatMessageIssue(value.body);
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: CHAT_QUALITY_COPY[issue],
      });
    }
  });

export const chatContactEmailBody = z.object({
  visitorId: optionalUuid,
  email: z.string().trim().email().max(180),
});

export const chatReadBody = z.object({
  visitorId: optionalUuid,
});

export const chatSocketTokenBody = z.object({
  visitorId: optionalUuid,
});

export const listChatQuery = z.object({
  status: z.enum(['all', 'unread', ...chatConversationStatuses]).default('all'),
  q: z.string().trim().max(120).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const chatIdParams = z.object({
  id: z.string().trim().cuid(),
});

export const listChatMessagesQuery = z.object({
  visitorId: optionalUuid,
  before: z.string().trim().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(40),
});

export const adminChatMessageBody = z
  .object({
    body: z.string().max(MAX_MESSAGE + 20).default(''),
  })
  .superRefine((value, ctx) => {
    const issue = chatMessageIssue(value.body);
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: CHAT_QUALITY_COPY[issue],
      });
    }
  });

export const patchChatConversationBody = z.object({
  status: z.enum(['waiting_for_team', 'waiting_for_user', 'resolved', 'closed', 'open']),
});

export type CreateChatMessageBody = z.infer<typeof createChatMessageBody>;
export type ListChatQuery = z.infer<typeof listChatQuery>;
