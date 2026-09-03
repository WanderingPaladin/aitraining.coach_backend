import type { MatchOpportunity } from './matchScore.js';

const SKILL_TERMS = [
  'evaluation',
  'evaluate',
  'writing',
  'reasoning',
  'research',
  'coding',
  'software',
  'finance',
  'science',
  'legal',
  'math',
  'data',
  'annotation',
  'rlhf',
  'prompt',
  'domain expertise',
  'communication',
  'editing',
  'technical',
  'healthcare',
  'education',
  'marketing',
] as const;

const CATEGORY_ALIASES: Record<string, string> = {
  finance: 'Finance',
  legal: 'Legal',
  coding: 'Coding',
  software: 'Coding',
  engineering: 'Coding',
  science: 'Science',
  research: 'Research',
  writing: 'Writing',
  evaluation: 'Evaluation',
  annotation: 'Evaluation',
  math: 'Science',
  healthcare: 'Healthcare',
  education: 'Education',
};

export function extractJobSkills(title: string, descriptionText: string, category: string | null): string[] {
  const hay = `${title} ${descriptionText} ${category ?? ''}`.toLowerCase();
  const hits: string[] = SKILL_TERMS.filter((term) => hay.includes(term));
  if (category) {
    hits.push(category.toLowerCase());
  }
  return [...new Set(hits)].slice(0, 8);
}

export function inferJobCategory(title: string, descriptionText: string, category: string | null): string {
  if (category) {
    return category;
  }
  const hay = `${title} ${descriptionText}`.toLowerCase();
  for (const [keyword, label] of Object.entries(CATEGORY_ALIASES)) {
    if (hay.includes(keyword)) {
      return label;
    }
  }
  return 'General AI Training';
}

export function isBeginnerFriendlyJob(experienceLevel: string | null | undefined, descriptionText: string): boolean {
  const hay = `${experienceLevel ?? ''} ${descriptionText}`.toLowerCase();
  return /entry|junior|beginner|no (prior )?experience|0\+?\s*year|intern/i.test(hay);
}

export function jobToMatchOpportunity(job: {
  title: string;
  descriptionText?: string | null;
  category?: string | null;
  experienceLevel?: string | null;
  location?: string | null;
  remoteType?: string | null;
  companyName: string;
}): MatchOpportunity {
  const descriptionText = job.descriptionText ?? '';
  return {
    category: inferJobCategory(job.title, descriptionText, job.category ?? null),
    skills: extractJobSkills(job.title, descriptionText, job.category ?? null),
    experienceRequirement: job.experienceLevel ?? null,
    location: job.location ?? null,
    remoteStatus: job.remoteType ?? null,
    beginnerFriendly: isBeginnerFriendlyJob(job.experienceLevel, descriptionText),
    eligibility: null,
    sourcePlatform: job.companyName,
  };
}
