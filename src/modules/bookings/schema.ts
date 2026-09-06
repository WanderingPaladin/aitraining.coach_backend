import { z } from 'zod';

export const createBookingBody = z.object({
  applicationId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  visitorId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

export const bookingIdParams = z.object({
  id: z.string().min(1),
});

export const cancelBookingBody = z.object({
  token: z.string().min(1),
});

export const listBookingsQuery = z.object({
  status: z.enum(['confirmed', 'cancelled']).optional(),
  applicationId: z.string().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
