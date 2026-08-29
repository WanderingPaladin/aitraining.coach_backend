import type { FastifyPluginAsync } from 'fastify';
import { bookingIdParams, cancelBookingBody, createBookingBody } from './schema.js';
import { cancelBooking, createBooking, serializeBooking } from './service.js';

export const bookingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/bookings',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = createBookingBody.parse(request.body);
      const booking = await createBooking(body);
      return reply.code(201).send({
        booking: serializeBooking(booking, { includeCancelToken: true }),
      });
    },
  );

  fastify.post('/bookings/:id/cancel', async (request) => {
    const params = bookingIdParams.parse(request.params);
    const body = cancelBookingBody.parse(request.body);
    const booking = await cancelBooking(params.id, body.token, false);
    return { booking: serializeBooking(booking) };
  });
};
