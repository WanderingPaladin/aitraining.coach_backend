import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../db/prisma.js';
import {
  forgotBody,
  loginBody,
  registerBody,
  resetBody,
  tokenBody,
} from './schema.js';
import {
  loginUser,
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  serializeUser,
  verifyEmail,
} from './service.js';
import { parseCookies } from '../admin/session.js';
import {
  USER_SESSION_COOKIE,
  clearUserSessionCookie,
  hashSessionToken,
  readSessionUser,
  requireUser,
  setUserSession,
} from './session.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/register',
    { config: { public: true, rateLimit: { max: 8, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = registerBody.parse(request.body);
      const user = await registerUser(body);
      await setUserSession(reply, user.id, false);
      return reply.code(201).send({ user: serializeUser(user) });
    },
  );

  fastify.post(
    '/login',
    { config: { public: true, rateLimit: { max: 12, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = loginBody.parse(request.body);
      const user = await loginUser(body);
      await setUserSession(reply, user.id, body.remember);
      return { user: serializeUser(user) };
    },
  );

  fastify.post('/logout', { config: { public: true } }, async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[USER_SESSION_COOKIE];
    if (token) {
      await prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    clearUserSessionCookie(reply);
    return { ok: true };
  });

  fastify.get('/me', { config: { public: true } }, async (request) => {
    const session = await readSessionUser(request);
    if (!session) {
      return { user: null };
    }
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    return { user: user ? serializeUser(user) : null };
  });

  fastify.post('/verify-email', { config: { public: true } }, async (request) => {
    const body = tokenBody.parse(request.body);
    const user = await verifyEmail(body.token);
    return { user: serializeUser(user) };
  });

  fastify.post(
    '/forgot-password',
    { config: { public: true, rateLimit: { max: 6, timeWindow: '15 minutes' } } },
    async (request) => {
      const body = forgotBody.parse(request.body);
      await requestPasswordReset(body.email);
      return { ok: true };
    },
  );

  fastify.post('/reset-password', { config: { public: true } }, async (request) => {
    const body = resetBody.parse(request.body);
    await resetPassword(body.token, body.password);
    return { ok: true };
  });

  fastify.post('/resend-verification', async (request) => {
    const user = await requireUser(request);
    await resendVerification(user.id);
    return { ok: true };
  });
};
