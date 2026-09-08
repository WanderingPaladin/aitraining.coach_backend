import {
  ASSESSMENT_QUESTIONS,
  PASS_SCORE,
  SCORE_WEIGHTS,
  type ScoreCategory,
} from './questions.js';

export type ScoreLevel = 'excellent' | 'ready' | 'developing' | 'foundation';

const CATEGORY_LABEL: Record<ScoreCategory, string> = {
  instruction_following: 'Instruction Following',
  response_evaluation: 'Response Evaluation',
  factuality: 'Factuality & Research Judgment',
  written_reasoning: 'Written Reasoning',
  attention_to_detail: 'Attention to Detail',
};

export function sanitizeWritten(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function scoreWritten(answer: string, keywords: string[]): number {
  const text = sanitizeWritten(answer).toLowerCase();
  if (text.length < 12) return 0;
  const hits = keywords.filter((word) => text.includes(word.toLowerCase())).length;
  if (hits >= 2 && text.length >= 24) return 1;
  if (hits >= 1 && text.length >= 20) return 0.6;
  if (text.length >= 40) return 0.35;
  return 0;
}

function itemScore(questionId: string, raw: unknown): number {
  const question = ASSESSMENT_QUESTIONS.find((item) => item.id === questionId);
  if (!question) return 0;
  if (question.type === 'written') {
    return scoreWritten(typeof raw === 'string' ? raw : '', question.keywords ?? []);
  }
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value && value === question.correct ? 1 : 0;
}

export function scoreAttempt(answers: Record<string, unknown>): {
  finalScore: number;
  passed: boolean;
  categoryScores: Record<ScoreCategory, number>;
  perQuestion: Array<{ id: string; correct: boolean; explanation: string; score: number }>;
} {
  const grouped: Record<ScoreCategory, number[]> = {
    instruction_following: [],
    response_evaluation: [],
    factuality: [],
    written_reasoning: [],
    attention_to_detail: [],
  };
  const perQuestion = ASSESSMENT_QUESTIONS.map((question) => {
    const score = itemScore(question.id, answers[question.id]);
    grouped[question.category].push(score);
    return {
      id: question.id,
      correct: score >= 0.6,
      explanation: question.explanation,
      score,
    };
  });

  const categoryScores = Object.fromEntries(
    (Object.keys(SCORE_WEIGHTS) as ScoreCategory[]).map((category) => {
      const values = grouped[category];
      const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return [category, Math.round(avg * 100)];
    }),
  ) as Record<ScoreCategory, number>;

  const weighted = (Object.keys(SCORE_WEIGHTS) as ScoreCategory[]).reduce(
    (sum, category) => sum + categoryScores[category] * SCORE_WEIGHTS[category],
    0,
  );
  const finalScore = Math.round(weighted);
  return {
    finalScore,
    passed: finalScore >= PASS_SCORE,
    categoryScores,
    perQuestion,
  };
}

export function levelForScore(score: number): ScoreLevel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'ready';
  if (score >= 60) return 'developing';
  return 'foundation';
}

export const LEVEL_COPY: Record<ScoreLevel, { title: string; body: string }> = {
  excellent: {
    title: 'Excellent Foundation',
    body: 'You demonstrated strong foundational evaluation, instruction-following, and written-reasoning skills.',
  },
  ready: {
    title: 'Ready to Start',
    body: 'You have a solid foundation for beginner AI-training work, with a few areas worth strengthening.',
  },
  developing: {
    title: 'Developing',
    body: 'You understand the core concepts, but some evaluation skills would benefit from additional practice.',
  },
  foundation: {
    title: 'Foundation Stage',
    body: 'You’re still developing the basic evaluation skills covered in this course. Review your weaker modules before trying more advanced practice.',
  },
};

export function bandForCategory(score: number): 'strong' | 'good' | 'developing' {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'good';
  return 'developing';
}

export function categoryLabel(category: ScoreCategory): string {
  return CATEGORY_LABEL[category];
}

export function recommendationsFor(categoryScores: Record<ScoreCategory, number>): string[] {
  const ranked = (Object.keys(categoryScores) as ScoreCategory[]).sort(
    (a, b) => categoryScores[a] - categoryScores[b],
  );
  const weakest = ranked[0];
  const tips: Record<ScoreCategory, string> = {
    instruction_following: 'Practice turning prompts into checklists before you judge a response.',
    response_evaluation: 'Compare answers against each requested part of the prompt, not overall quality alone.',
    factuality: 'Flag specific dates, statistics, and study claims for verification when research is allowed.',
    written_reasoning: 'Use Decision → Evidence → Impact so your comments cite a concrete difference.',
    attention_to_detail: 'Re-read formatting, count, and ordering constraints before you submit a rating.',
  };
  const next = [
    tips[weakest ?? 'instruction_following'],
    'Explore opportunities that match skills you already have—this assessment does not predict platform acceptance.',
    'Review your results with a coach if you want a practical next-step plan.',
  ];
  return next;
}
