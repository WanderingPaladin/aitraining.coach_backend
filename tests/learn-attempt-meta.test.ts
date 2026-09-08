import { describe, expect, it } from 'vitest';
import { encodeQuestionSet, mergeAnswers, publicAnswers, readQuestionSet } from '../src/modules/learn/attempt-meta.js';
import { startAttemptBody } from '../src/modules/learn/schema.js';
import { serializeError } from '../src/lib/http.js';
import { Prisma } from '@prisma/client';

describe('assessment question-set persistence', () => {
  it('stores and reads locked question ids without a dedicated column', () => {
    const ids = ['q1', 'q2', 'justification-01'];
    const stored = encodeQuestionSet(ids);
    expect(readQuestionSet(stored)).toEqual(ids);
    expect(publicAnswers({ ...stored, q1: 'A' })).toEqual({ q1: 'A' });
  });

  it('upserts answers without dropping the locked set', () => {
    const merged = mergeAnswers(encodeQuestionSet(['q1', 'q2']), { q1: 'B' }, ['q1', 'q2']);
    expect(readQuestionSet(merged)).toEqual(['q1', 'q2']);
    expect(publicAnswers(merged)).toEqual({ q1: 'B' });
  });

  it('accepts retake on start without requiring an attempt id', () => {
    const parsed = startAttemptBody.parse({ visitorId: '11111111-1111-4111-8111-111111111111', retake: true });
    expect(parsed.retake).toBe(true);
  });

  it('maps missing-column prisma errors to a recoverable 503', () => {
    const error = new Prisma.PrismaClientKnownRequestError('column missing', {
      code: 'P2022',
      clientVersion: '6.15.0',
    });
    const serialized = serializeError(error);
    expect(serialized.statusCode).toBe(503);
    expect(serialized.body.error.code).toBe('ASSESSMENT_STORAGE_UNAVAILABLE');
  });
});
