import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { adminLoginSecret, config, sessionSigningSecret } from '../../config.js';
import { unauthorized } from '../../lib/errors.js';

export const ADMIN_SESSION_COOKIE = 'ait_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AdminActor = {
  name: string;
};

function cookieSecret(): Buffer {
  return Buffer.from(sessionSigningSecret());
}

function sign(value: string): string {
  return createHmac('sha256', cookieSecret()).update(value).digest('base64url');
}

function encodeSession(expiresAt: number): string {
  const payload = `admin.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string | undefined): boolean {
  if (!token) {
    return false;
  }
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 1) {
    return false;
  }
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }
  const [, exp] = payload.split('.');
  const expiresAt = Number(exp);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) {
      continue;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

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

export function passwordMatches(password: string): boolean {
  const expected = adminLoginSecret();
  const passwordBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  if (passwordBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(passwordBuffer, expectedBuffer);
}

function cookieHeader(value: string, maxAge: number): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}`,
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

export function setAdminSession(reply: FastifyReply): void {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  reply.header('Set-Cookie', cookieHeader(encodeSession(expiresAt), SESSION_TTL_SECONDS));
}

export function clearAdminSession(reply: FastifyReply): void {
  reply.header('Set-Cookie', cookieHeader('', 0));
}

export function authenticateAdmin(request: FastifyRequest): AdminActor {
  if (bearerMatches(request.headers.authorization, config.ADMIN_API_KEY)) {
    return { name: config.ADMIN_NAME };
  }
  const cookies = parseCookies(request.headers.cookie);
  if (decodeSession(cookies[ADMIN_SESSION_COOKIE])) {
    return { name: config.ADMIN_NAME };
  }
  throw unauthorized();
}
