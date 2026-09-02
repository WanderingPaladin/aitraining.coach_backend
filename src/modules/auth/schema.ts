import { z } from 'zod';
import { isValidEmailAddress } from '../../lib/apply-fields.js';

export const registerBody = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(isValidEmailAddress, 'Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export const loginBody = registerBody.extend({
  remember: z.boolean().optional().default(false),
});

export const forgotBody = z.object({
  email: z.string().trim().toLowerCase().max(254).refine(isValidEmailAddress, 'Enter a valid email address.'),
});

export const tokenBody = z.object({
  token: z.string().trim().min(10).max(200),
});

export const resetBody = tokenBody.extend({
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});
