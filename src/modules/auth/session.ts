import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config.js';
import { prisma } from '../../db/prisma.js';
import { unauthorized } from '../../lib/errors.js';
import { randomToken } from '../../lib/password.js';
import { parseCookies } from '../admin/session.js';

export const USER_SESSION_COOKIE = 'ait_user_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_TTL_REMEMBER_SECONDS = 60 * 60 * 24 * 90;

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
};

function cookieHeader(value: string, maxAge: number): string {
  const parts = [
    `${USER_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (config.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function setUserSession(
  reply: FastifyReply,
  userId: string,
  remember: boolean,
): Promise<void> {
  const token = randomToken();
  const ttl = remember ? SESSION_TTL_REMEMBER_SECONDS : SESSION_TTL_SECONDS;
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + ttl * 1000),
    },
  });
  reply.header('Set-Cookie', cookieHeader(token, ttl));
}

export function clearUserSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', cookieHeader('', 0));
}

export async function readSessionUser(request: FastifyRequest): Promise<AuthUser | null> {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[USER_SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: Boolean(session.user.emailVerifiedAt),
  };
}

export async function requireUser(request: FastifyRequest): Promise<AuthUser> {
  const user = await readSessionUser(request);
  if (!user) {
    throw unauthorized('Sign in to continue');
  }
  return user;
}
