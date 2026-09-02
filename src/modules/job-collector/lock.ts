import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';

const LOCK_ID = 'global';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export async function acquireJobSyncLock(ttlMs = DEFAULT_TTL_MS): Promise<string | null> {
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);
  const owner = randomUUID();
  const updated = await prisma.jobSyncLock.updateMany({
    where: {
      id: LOCK_ID,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { owner, lockedAt: now, lockedUntil: until },
  });
  if (updated.count === 1) {
    return owner;
  }
  await prisma.jobSyncLock.upsert({
    where: { id: LOCK_ID },
    update: {},
    create: { id: LOCK_ID },
  });
  const retry = await prisma.jobSyncLock.updateMany({
    where: {
      id: LOCK_ID,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { owner, lockedAt: now, lockedUntil: until },
  });
  return retry.count === 1 ? owner : null;
}

export async function releaseJobSyncLock(owner: string): Promise<void> {
  await prisma.jobSyncLock.updateMany({
    where: { id: LOCK_ID, owner },
    data: { owner: null, lockedAt: null, lockedUntil: null },
  });
}

export async function withJobSyncLock<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: 'locked' }> {
  const owner = await acquireJobSyncLock();
  if (!owner) {
    return { ok: false, reason: 'locked' };
  }
  try {
    const value = await fn();
    return { ok: true, value };
  } finally {
    await releaseJobSyncLock(owner);
  }
}
