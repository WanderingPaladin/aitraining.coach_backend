import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_QUESTIONS,
  CATEGORY_TARGETS,
  PASS_SCORE,
  questionsForIds,
  selectAttemptQuestionIds,
} from '../src/modules/learn/questions.js';
import { levelForScore, scoreAttempt } from '../src/modules/learn/score.js';
import { newCredentialId } from '../src/modules/learn/pdf.js';

describe('foundations assessment v2', () => {
  it('does not expose answers on selected public questions', () => {
    const ids = selectAttemptQuestionIds();
    expect(ids).toHaveLength(26);
    const published = questionsForIds(ids);
    expect(published).toHaveLength(26);
    expect(published[0]).not.toHaveProperty('correct');
    expect(published[0]).not.toHaveProperty('explanation');
    expect(published[0]).not.toHaveProperty('category');
  });

  it('balances core questions by category', () => {
    const ids = selectAttemptQuestionIds().filter((id) => id.startsWith('q'));
    const counts: Record<string, number> = {};
    for (const id of ids) {
      const question = ASSESSMENT_QUESTIONS.find((item) => item.id === id);
      if (!question) continue;
      counts[question.category] = (counts[question.category] ?? 0) + 1;
    }
    expect(counts).toMatchObject(CATEGORY_TARGETS);
  });

  it('scores a perfect selected attempt at 100', () => {
    const ids = selectAttemptQuestionIds();
    const answers: Record<string, string> = {};
    for (const id of ids) {
      const question = ASSESSMENT_QUESTIONS.find((item) => item.id === id);
      if (!question) continue;
      if (question.type === 'written') {
        answers[id] = 'Response A is stronger because it satisfies both requested categories while B omits disadvantages.';
      } else {
        answers[id] = question.correct ?? '';
      }
    }
    const result = scoreAttempt(answers, ids);
    expect(result.finalScore).toBeGreaterThanOrEqual(PASS_SCORE);
    expect(result.passed).toBe(true);
  });

  it('does not pass an empty attempt', () => {
    const result = scoreAttempt({}, selectAttemptQuestionIds());
    expect(result.finalScore).toBe(0);
    expect(result.passed).toBe(false);
    expect(levelForScore(result.finalScore)).toBe('foundation');
  });

  it('generates non-sequential credential ids', () => {
    const first = newCredentialId();
    const second = newCredentialId();
    expect(first).toMatch(/^ATC-FND-\d{2}-[A-Z0-9]{5}$/);
    expect(first).not.toBe(second);
  });
});
