import { z } from 'zod';

export const opportunityIdParams = z.object({
  id: z.string().min(1).max(40),
});

export const listOpportunitiesQuery = z.object({
  q: z.string().trim().max(120).optional().default(''),
  platform: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  beginnerFriendly: z
    .enum(['true', 'false', ''])
    .optional()
    .default('')
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : undefined)),
  remote: z
    .enum(['true', 'false', ''])
    .optional()
    .default('')
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : undefined)),
  sort: z.enum(['newest', 'match']).optional().default('newest'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
});
