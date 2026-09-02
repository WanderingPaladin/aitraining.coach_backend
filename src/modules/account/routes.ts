import type { FastifyPluginAsync } from 'fastify';
import { recordAccountActivity } from '../auth/service.js';
import { requireUser } from '../auth/session.js';
import { patchProfileBody } from './schema.js';
import {
  getAccount,
  listAccountActivity,
  listLinkedApplications,
  serializeProfile,
  updateAccountProfile,
} from './service.js';

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/profile', async (request) => {
    const session = await requireUser(request);
    const account = await getAccount(session.id);
    const applications = await listLinkedApplications(session.id);
    return { ...account, applications };
  });

  fastify.patch('/profile', async (request) => {
    const session = await requireUser(request);
    const body = patchProfileBody.parse(request.body);
    const profile = await updateAccountProfile(session.id, body);
    await recordAccountActivity(session.id, 'profile_updated', 'Profile updated');
    const account = await getAccount(session.id);
    return { ...account, profile: serializeProfile(profile) };
  });

  fastify.get('/activity', async (request) => {
    const session = await requireUser(request);
    const activity = await listAccountActivity(session.id);
    return { activity };
  });
};
