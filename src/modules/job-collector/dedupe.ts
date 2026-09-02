import type { JobSourceType } from '@prisma/client';
import { ATS_SOURCE_TYPES } from './types.js';

export type DedupeCandidate = {
  id: string;
  sourceId: string;
  sourceType: JobSourceType;
  sourcePriority: number;
  fingerprint: string;
  isActive: boolean;
  isDuplicate: boolean;
};

export function sourceRank(sourceType: JobSourceType, sourcePriority: number): number {
  const atsBoost = ATS_SOURCE_TYPES.includes(sourceType) ? 0 : sourceType === 'jsonld' ? 50 : 80;
  return atsBoost + sourcePriority;
}

export function chooseCanonicalJob<T extends DedupeCandidate>(left: T, right: T): T {
  const leftRank = sourceRank(left.sourceType, left.sourcePriority);
  const rightRank = sourceRank(right.sourceType, right.sourcePriority);
  if (leftRank !== rightRank) {
    return leftRank < rightRank ? left : right;
  }
  return left.id <= right.id ? left : right;
}

export function applyFingerprintDedupe<T extends DedupeCandidate>(jobs: T[]): T[] {
  const byFingerprint = new Map<string, T[]>();
  for (const job of jobs) {
    const group = byFingerprint.get(job.fingerprint) ?? [];
    group.push(job);
    byFingerprint.set(job.fingerprint, group);
  }

  const result: T[] = [];
  for (const group of byFingerprint.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) {
        result.push({ ...only, isDuplicate: false });
      }
      continue;
    }
    const canonical = group.reduce((winner, current) => chooseCanonicalJob(winner, current));
    for (const job of group) {
      result.push({
        ...job,
        isDuplicate: job.id !== canonical.id,
      });
    }
  }
  return result;
}

export function shouldMarkStale(input: {
  isActive: boolean;
  lastSeenAt: Date;
  sourceLastSuccessAt: Date | null;
  now?: Date;
  staleAfterMs?: number;
}): boolean {
  if (!input.isActive) {
    return false;
  }
  if (!input.sourceLastSuccessAt) {
    return false;
  }
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? 24 * 60 * 60 * 1000;
  if (now.getTime() - input.lastSeenAt.getTime() < staleAfterMs) {
    return false;
  }
  return input.sourceLastSuccessAt.getTime() > input.lastSeenAt.getTime();
}
