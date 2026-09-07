import { createHmac, timingSafeEqual } from 'node:crypto';

export type ChatTokenPayload =
  | { role: 'visitor'; visitorId: string; exp: number }
  | { role: 'admin'; exp: number };

function secret() {
  return process.env.SESSION_SECRET?.trim() || process.env.ADMIN_API_KEY?.trim() || 'dev-chat-token';
}

function b64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function sign(encoded: string) {
  return createHmac('sha256', secret()).update(encoded).digest('base64url');
}

export function issueChatToken(
  payload: { role: 'admin' } | { role: 'visitor'; visitorId: string },
  ttlMs = 12 * 60 * 60 * 1000,
): string {
  const body: ChatTokenPayload = { ...payload, exp: Date.now() + ttlMs } as ChatTokenPayload;
  const encoded = b64url(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyChatToken(token: string): ChatTokenPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ChatTokenPayload;
    if (!payload?.role || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (payload.role === 'visitor' && !payload.visitorId) return null;
    return payload;
  } catch {
    return null;
  }
}
