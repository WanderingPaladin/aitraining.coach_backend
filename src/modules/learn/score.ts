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

export const LEVEL_COPY: Record<ScoreLevel, { title: string; body: string; cta: string }> = {
  excellent: {
    title: 'Excellent Foundation',
    body: 'You demonstrated strong foundational skills in instruction following, response evaluation, factuality judgment, and written reasoning.',
    cta: 'Explore opportunities that match your existing professional or academic skills.',
  },
  ready: {
    title: 'Ready to Start',
    body: 'You have a solid foundation for beginner AI-evaluation work. A few areas may benefit from additional practice, but you understand the core concepts covered in this course.',
    cta: 'Practice your weaker areas and explore suitable opportunities.',
  },
  developing: {
    title: 'Developing',
    body: 'You understand many of the important concepts, but your results suggest that additional practice would be useful before attempting more demanding evaluation work.',
    cta: 'Review your lowest-scoring modules and complete additional practice exercises.',
  },
  foundation: {
    title: 'Foundation Stage',
    body: 'You’re still developing the foundational skills covered in this course. Reviewing the lessons and practicing response evaluation should help strengthen your understanding.',
    cta: 'Review the course before retaking the assessment.',
  },
};

export const CATEGORY_COPY: Record<ScoreCategory, { strong: string; develop: string }> = {
  instruction_following: {
    strong: 'You’re strong at identifying explicit requirements and noticing when responses violate formatting, length, or content constraints.',
    develop: 'Practice turning prompts into checklists and evaluating every constraint separately.',
  },
  response_evaluation: {
    strong: 'You consistently distinguish stronger and weaker responses using relevance, clarity, completeness, and overall usefulness.',
    develop: 'Practice comparing responses across several quality dimensions instead of relying on overall impression.',
  },
  factuality: {
    strong: 'You show good judgment around factual claims, uncertainty, and when verification is appropriate.',
    develop: 'Practice distinguishing factual claims from opinions and identifying claims that require verification.',
  },
  written_reasoning: {
    strong: 'Your evaluation explanations are generally specific, neutral, and evidence-based.',
    develop: 'Use the Decision → Evidence → Impact framework to make your explanations more specific.',
  },
  attention_to_detail: {
    strong: 'You reliably notice subtle prompt constraints and small instruction violations.',
    develop: 'Slow down on multi-constraint prompts and use a checklist before making the final judgment.',
  },
};

export function insightForCategory(category: ScoreCategory, score: number) {
  return score >= 85 ? CATEGORY_COPY[category].strong : CATEGORY_COPY[category].develop;
}

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
    'Explore opportunities that match your existing professional or academic skills. This assessment does not predict platform acceptance.',
    'Review your results with a coach if you want a practical next-step plan.',
  ];
  return next;
}
