import {
  CATEGORY_RULES,
  CONTEXT_BONUS_TERMS,
  DESCRIPTION_POSITIVE_TERMS,
  NEGATIVE_TITLE_TERMS,
  TITLE_OVERRIDE_TERMS,
  TITLE_POSITIVE_TERMS,
  type WeightedTerm,
} from './relevance-weights.js';
import type { JobCategory, NormalizedJob } from './types.js';
import { REVIEW_MIN_SCORE } from './types.js';

function containsTerm(haystack: string, term: string): boolean {
  return haystack.includes(term.toLowerCase());
}

function scoreTerms(haystack: string, terms: WeightedTerm[]): number {
  let score = 0;
  for (const term of terms) {
    if (containsTerm(haystack, term.term)) {
      score += term.score;
    }
  }
  return score;
}

function titleHasOverride(title: string): boolean {
  return TITLE_OVERRIDE_TERMS.some((term) => title.includes(term));
}

function titleLooksUnrelated(title: string): boolean {
  if (titleHasOverride(title)) {
    return false;
  }
  return NEGATIVE_TITLE_TERMS.some((term) => title.includes(term));
}

export function scoreRelevance(job: Pick<NormalizedJob, 'title' | 'descriptionText' | 'remoteType' | 'employmentType'>): number {
  const title = job.title.toLowerCase();
  const description = job.descriptionText.toLowerCase();
  const context = `${job.remoteType ?? ''} ${job.employmentType ?? ''} ${title} ${description}`.toLowerCase();

  let score = scoreTerms(title, TITLE_POSITIVE_TERMS);
  score += scoreTerms(description, DESCRIPTION_POSITIVE_TERMS);
  score += scoreTerms(context, CONTEXT_BONUS_TERMS);

  if (titleLooksUnrelated(title)) {
    score -= 80;
  }

  return Math.max(0, Math.min(100, score));
}

export function assignCategory(
  job: Pick<NormalizedJob, 'title' | 'descriptionText'>,
): JobCategory {
  const hay = `${job.title} ${job.descriptionText}`.toLowerCase();
  let best: { category: JobCategory; hits: number } | null = null;
  for (const rule of CATEGORY_RULES) {
    const hits = rule.patterns.reduce((count, pattern) => count + (hay.includes(pattern) ? 1 : 0), 0);
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { category: rule.category, hits };
    }
  }
  return best?.category ?? 'General AI Training';
}

export function shouldStoreJob(score: number): boolean {
  return score >= REVIEW_MIN_SCORE || score > 0;
}
