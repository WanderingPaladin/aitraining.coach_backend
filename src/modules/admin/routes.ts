import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config.js';
import { unauthorized } from '../../lib/errors.js';
import {
  applicationIdParams,
  listApplicationsQuery,
  patchApplicationBody,
} from '../applications/schema.js';
import {
  getApplication,
  listApplications,
  serializeApplication,
  updateApplicationStatus,
} from '../applications/service.js';
import {
  availabilityIdParams,
  availabilityRuleBody,
  patchAvailabilityBody,
} from '../availability/schema.js';
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
  listAvailabilityRules,
  serializeAvailabilityRule,
  updateAvailabilityRule,
} from '../availability/service.js';
import { bookingIdParams, listBookingsQuery } from '../bookings/schema.js';
import { cancelBooking, listBookings, serializeBooking } from '../bookings/service.js';

function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) {
    return false;
  }
  const token = header.slice('Bearer '.length);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(tokenBuffer, expectedBuffer);
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request) => {
    if (!bearerMatches(request.headers.authorization, config.ADMIN_API_KEY)) {
      throw unauthorized();
    }
  });

  fastify.get('/applications', async (request) => {
    const query = listApplicationsQuery.parse(request.query);
    const result = await listApplications(query);
    return {
      ...result,
      items: result.items.map(serializeApplication),
    };
  });

  fastify.get('/applications/:id', async (request) => {
    const params = applicationIdParams.parse(request.params);
    const application = await getApplication(params.id);
    return {
      application: {
        ...serializeApplication(application),
        bookings: application.bookings.map((booking) => serializeBooking(booking)),
      },
    };
  });

  fastify.patch('/applications/:id', async (request) => {
    const params = applicationIdParams.parse(request.params);
    const body = patchApplicationBody.parse(request.body);
    const application = await updateApplicationStatus(params.id, body.status);
    return { application: serializeApplication(application) };
  });

  fastify.get('/availability', async () => {
    const rules = await listAvailabilityRules();
    return { rules: rules.map(serializeAvailabilityRule) };
  });

  fastify.post('/availability', async (request, reply) => {
    const body = availabilityRuleBody.parse(request.body);
    const rule = await createAvailabilityRule(body);
    return reply.code(201).send({ rule: serializeAvailabilityRule(rule) });
  });

  fastify.patch('/availability/:id', async (request) => {
    const params = availabilityIdParams.parse(request.params);
    const body = patchAvailabilityBody.parse(request.body);
    const rule = await updateAvailabilityRule(params.id, body);
    return { rule: serializeAvailabilityRule(rule) };
  });

  fastify.delete('/availability/:id', async (request, reply) => {
    const params = availabilityIdParams.parse(request.params);
    await deleteAvailabilityRule(params.id);
    return reply.code(204).send();
  });

  fastify.get('/bookings', async (request) => {
    const query = listBookingsQuery.parse(request.query);
    const result = await listBookings(query);
    return {
      ...result,
      items: result.items.map((booking) => ({
        ...serializeBooking(booking),
        application: {
          id: booking.application.id,
          firstName: booking.application.firstName,
          lastName: booking.application.lastName,
          fullName: booking.application.fullName,
          email: booking.application.email,
          status: booking.application.status,
        },
      })),
    };
  });

  fastify.post('/bookings/:id/cancel', async (request) => {
    const params = bookingIdParams.parse(request.params);
    const booking = await cancelBooking(params.id, undefined, true);
    return { booking: serializeBooking(booking) };
  });
};
