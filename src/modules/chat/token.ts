import { createHmac, timingSafeEqual } from 'node:crypto';
import { sessionSigningSecret } from '../../config.js';

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

export type ChatSocketRole = 'visitor' | 'user' | 'admin';

export type ChatSocketClaims = {
  role: ChatSocketRole;
  visitorId?: string;
  userId?: string;
  exp: number;
};

function sign(value: string): string {
  return createHmac('sha256', sessionSigningSecret()).update(value).digest('base64url');
}

export function issueChatSocketToken(claims: Omit<ChatSocketClaims, 'exp'>): string {
  const payload: ChatSocketClaims = { ...claims, exp: Date.now() + TOKEN_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyChatSocketToken(token: string | undefined): ChatSocketClaims | null {
  if (!token) {
    return null;
  }
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 1) {
    return null;
  }
  const encoded = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ChatSocketClaims;
    if (!claims?.role || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
