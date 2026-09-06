import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config.js';
import { applicationIdParams } from '../applications/schema.js';
import { getApplication, serializeApplication } from '../applications/service.js';
import { bookingIdParams } from '../bookings/schema.js';
import { serializeBooking } from '../bookings/service.js';
import {
  analyticsQuery,
  patchIntroCallBody,
  upsertPlatformProgressBody,
} from './schema.js';
import {
  getFunnelAnalytics,
  listApplicationJourney,
  listPlatformProgress,
  serializePlatformProgress,
  updateIntroCallAttendance,
  upsertPlatformProgress,
} from './service.js';

export const trackingAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/analytics/funnel', async (request) => {
    const query = analyticsQuery.parse(request.query);
    return getFunnelAnalytics(query);
  });

  fastify.get('/applications/:id/journey', async (request) => {
    const params = applicationIdParams.parse(request.params);
    const events = await listApplicationJourney(params.id);
    return { events };
  });

  fastify.get('/applications/:id/platforms', async (request) => {
    const params = applicationIdParams.parse(request.params);
    const items = await listPlatformProgress(params.id);
    return { items };
  });

  fastify.post('/applications/:id/platforms', async (request, reply) => {
    const params = applicationIdParams.parse(request.params);
    const body = upsertPlatformProgressBody.parse(request.body);
    const row = await upsertPlatformProgress(
      params.id,
      body,
      request.admin?.name ?? config.ADMIN_NAME,
    );
    const progress = await listPlatformProgress(params.id);
    const events = await listApplicationJourney(params.id);
    const { application, previousId, nextId } = await getApplication(params.id);
    return reply.code(201).send({
      platform: serializePlatformProgress(row),
      platforms: progress,
      events,
      application: {
        ...serializeApplication(application),
        previousId,
        nextId,
        bookings: application.bookings.map((booking) => serializeBooking(booking)),
      },
    });
  });

  fastify.patch('/bookings/:id/attendance', async (request) => {
    const params = bookingIdParams.parse(request.params);
    const body = patchIntroCallBody.parse(request.body);
    const booking = await updateIntroCallAttendance(
      params.id,
      body.attendance,
      request.admin?.name ?? config.ADMIN_NAME,
    );
    return { booking: serializeBooking(booking) };
  });
};
