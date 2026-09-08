import { describe, expect, it } from 'vitest';
import { ASSESSMENT_QUESTIONS, PASS_SCORE, publicQuestions } from '../src/modules/learn/questions.js';
import { levelForScore, scoreAttempt } from '../src/modules/learn/score.js';
import { newCredentialId } from '../src/modules/learn/pdf.js';

describe('foundations assessment', () => {
  it('does not expose answers on the public question payload', () => {
    const published = publicQuestions();
    expect(published).toHaveLength(23);
    expect(published[0]).not.toHaveProperty('correct');
    expect(published[0]).not.toHaveProperty('explanation');
    expect(published[0]).not.toHaveProperty('category');
    expect(published[0]).not.toHaveProperty('keywords');
  });

  it('scores a perfect attempt at 100 and passing', () => {
    const answers: Record<string, string> = {};
    for (const question of ASSESSMENT_QUESTIONS) {
      if (question.id === 'p2') {
        answers[question.id] =
          'The second sentence is overly absolute and unsupported: adults do not all need exactly nine hours.';
      } else {
        answers[question.id] = question.correct ?? '';
      }
    }
    const result = scoreAttempt(answers);
    expect(result.finalScore).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.finalScore).toBeGreaterThanOrEqual(PASS_SCORE);
  });

  it('does not pass an empty attempt', () => {
    const result = scoreAttempt({});
    expect(result.finalScore).toBe(0);
    expect(result.passed).toBe(false);
    expect(levelForScore(result.finalScore)).toBe('foundation');
  });

  it('scores instruction-following misses independently of tone', () => {
    const result = scoreAttempt({ q1: 'A', q4: 'yes' });
    expect(result.perQuestion.find((item) => item.id === 'q1')?.correct).toBe(false);
    expect(result.perQuestion.find((item) => item.id === 'q4')?.correct).toBe(true);
  });

  it('generates non-sequential credential ids', () => {
    const first = newCredentialId();
    const second = newCredentialId();
    expect(first).toMatch(/^ATC-FND-\d{2}-[A-Z0-9]{5}$/);
    expect(first).not.toBe(second);
  });
});
