import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config.js';
import {
  applicationIdParams,
  bulkApplicationsBody,
  createNoteBody,
  listApplicationsQuery,
  loginBody,
  patchApplicationBody,
} from '../applications/schema.js';
import {
  addApplicationNote,
  applicationsToCsv,
  bulkUpdateApplications,
  getApplication,
  getOverview,
  listApplications,
  listApplicationsForExport,
  listFilterOptions,
  serializeApplication,
  updateApplication,
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
import { feedbackAdminRoutes } from '../feedback/admin-routes.js';
import { trackingAdminRoutes } from '../tracking/admin-routes.js';
import { jobAdminRoutes } from '../jobs/admin-routes.js';
import {
  authenticateAdmin,
  clearAdminSession,
  passwordMatches,
  setAdminSession,
} from './session.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/login',
    {
      config: {
        public: true,
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const body = loginBody.parse(request.body);
      if (!passwordMatches(body.password)) {
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid admin password' },
        });
      }
      setAdminSession(reply);
      return { admin: { name: config.ADMIN_NAME } };
    },
  );

  fastify.post(
    '/logout',
    { config: { public: true } },
    async (_request, reply) => {
      clearAdminSession(reply);
      return { ok: true };
    },
  );

  fastify.addHook('preHandler', async (request) => {
    if (request.routeOptions.config?.public) {
      return;
    }
    request.admin = authenticateAdmin(request);
  });

  fastify.get('/me', async (request) => ({
    admin: { name: request.admin?.name ?? config.ADMIN_NAME },
  }));

  fastify.get('/overview', async () => {
    const overview = await getOverview();
    return {
      kpis: overview.kpis,
      pipeline: overview.pipeline,
      needsAttention: overview.needsAttention.map(serializeApplication),
      recent: overview.recent.map(serializeApplication),
    };
  });

  fastify.get('/applications/options', async () => listFilterOptions());

  fastify.get('/applications.csv', async (request, reply) => {
    const query = listApplicationsQuery.parse(request.query);
    const items = await listApplicationsForExport(query);
    const csv = applicationsToCsv(items);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="applications.csv"')
      .send(csv);
  });

  fastify.get('/applications', async (request) => {
    const query = listApplicationsQuery.parse(request.query);
    const result = await listApplications(query);
    return {
      ...result,
      items: result.items.map(serializeApplication),
    };
  });

  fastify.post('/applications/bulk', async (request) => {
    const body = bulkApplicationsBody.parse(request.body);
    const actor = request.admin?.name ?? config.ADMIN_NAME;
    return bulkUpdateApplications(body.ids, body, actor);
  });

  fastify.get('/applications/:id', async (request) => {
    const params = applicationIdParams.parse(request.params);
    const { application, previousId, nextId } = await getApplication(params.id);
    return {
      application: {
        ...serializeApplication(application),
        previousId,
        nextId,
        bookings: application.bookings.map((booking) => serializeBooking(booking)),
      },
    };
  });

  fastify.patch('/applications/:id', async (request) => {
    const params = applicationIdParams.parse(request.params);
    const body = patchApplicationBody.parse(request.body);
    if (Object.keys(body).length === 0) {
      const { application, previousId, nextId } = await getApplication(params.id);
      return {
        application: {
          ...serializeApplication(application),
          previousId,
          nextId,
        },
      };
    }
    const updated = await updateApplication(
      params.id,
      body,
      request.admin?.name ?? config.ADMIN_NAME,
    );
    const { application, previousId, nextId } = await getApplication(updated.id);
    return {
      application: {
        ...serializeApplication(application),
        previousId,
        nextId,
        bookings: application.bookings.map((booking) => serializeBooking(booking)),
      },
    };
  });

  fastify.post('/applications/:id/notes', async (request, reply) => {
    const params = applicationIdParams.parse(request.params);
    const body = createNoteBody.parse(request.body);
    const note = await addApplicationNote(
      params.id,
      body.body,
      request.admin?.name ?? config.ADMIN_NAME,
    );
    return reply.code(201).send({
      note: {
        id: note.id,
        author: note.author,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
      },
    });
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
          pipelineStage: booking.application.pipelineStage,
        },
      })),
    };
  });

  fastify.post('/bookings/:id/cancel', async (request) => {
    const params = bookingIdParams.parse(request.params);
    const booking = await cancelBooking(params.id, undefined, true);
    return { booking: serializeBooking(booking) };
  });

  await fastify.register(jobAdminRoutes);
  await fastify.register(feedbackAdminRoutes);
  await fastify.register(trackingAdminRoutes);
};
