import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    visitor: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    assessmentAttempt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { startAttempt } from '../src/modules/learn/service.js';

const visitorId = '11111111-1111-4111-8111-111111111111';
const identity = { userId: null, visitorId };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.visitor.findUnique).mockResolvedValue({ id: visitorId } as never);
  vi.mocked(prisma.assessmentAttempt.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.assessmentAttempt.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.assessmentAttempt.create).mockResolvedValue({
    id: 'attempt_new',
    answers: {},
    submitted: false,
  } as never);
});

describe('startAttempt retake', () => {
  it('creates a new in-progress attempt when retake is true', async () => {
    const result = await startAttempt(identity, {
      visitorId,
      courseSlug: 'ai-training-foundations',
      retake: true,
    });

    expect(result.attempt.submitted).toBe(false);
    expect(result.attempt.id).toBe('attempt_new');
    expect(result.questions.length).toBeGreaterThan(0);
    expect(prisma.assessmentAttempt.create).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(prisma.assessmentAttempt.create).mock.calls[0]?.[0];
    expect(payload?.data).not.toHaveProperty('questionSet');
    expect(payload?.data).not.toHaveProperty('userId');
    expect(payload?.data).not.toHaveProperty('visitorId');
    expect(payload?.select).toEqual({ id: true, answers: true, submitted: true });
    expect((payload?.data as { answers?: Record<string, string> }).answers).toHaveProperty('__questionSet');
    expect((payload?.data as { visitor?: { connect?: { id?: string } } }).visitor).toEqual({
      connect: { id: visitorId },
    });
    expect(prisma.assessmentAttempt.findFirst).toHaveBeenCalledTimes(1);
  });

  it('resumes an open attempt instead of creating a second one', async () => {
    vi.mocked(prisma.assessmentAttempt.findFirst).mockResolvedValue({
      id: 'attempt_open',
      answers: { __questionSet: 'q1,q2', q1: 'A' },
      submitted: false,
      userId: null,
      visitorId,
    } as never);

    const result = await startAttempt(identity, {
      visitorId,
      courseSlug: 'ai-training-foundations',
      retake: true,
    });

    expect(result.attempt.id).toBe('attempt_open');
    expect(prisma.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('falls back to a column-safe insert when prisma create rejects a missing field', async () => {
    vi.mocked(prisma.assessmentAttempt.create).mockRejectedValue(
      new Prisma.PrismaClientValidationError('Argument `questionSet` is missing.', {
        clientVersion: '6.15.0',
      }),
    );
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

    const result = await startAttempt(identity, {
      visitorId,
      courseSlug: 'ai-training-foundations',
      retake: true,
    });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(result.attempt.submitted).toBe(false);
    expect(result.attempt.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.questions.length).toBeGreaterThan(0);
  });
});
