import type { JobCategory } from './types.js';

export type WeightedTerm = {
  term: string;
  score: number;
};

export const TITLE_POSITIVE_TERMS: WeightedTerm[] = [
  { term: 'ai trainer', score: 50 },
  { term: 'ai training specialist', score: 50 },
  { term: 'ai evaluator', score: 50 },
  { term: 'llm evaluator', score: 50 },
  { term: 'model evaluator', score: 45 },
  { term: 'prompt evaluator', score: 50 },
  { term: 'ai tutor', score: 45 },
  { term: 'ai reviewer', score: 40 },
  { term: 'ai quality reviewer', score: 45 },
  { term: 'ai quality specialist', score: 45 },
  { term: 'rlhf', score: 50 },
  { term: 'human feedback', score: 45 },
  { term: 'data annotator', score: 45 },
  { term: 'data annotation', score: 45 },
  { term: 'ai data specialist', score: 40 },
  { term: 'ai writer', score: 40 },
  { term: 'ai content reviewer', score: 40 },
  { term: 'domain expert', score: 35 },
  { term: 'subject matter expert', score: 30 },
  { term: 'coding expert', score: 35 },
  { term: 'math expert', score: 35 },
  { term: 'legal expert', score: 35 },
  { term: 'finance expert', score: 35 },
  { term: 'science expert', score: 35 },
  { term: 'language expert', score: 35 },
  { term: 'ai safety evaluator', score: 50 },
  { term: 'search quality evaluator', score: 45 },
  { term: 'response evaluator', score: 45 },
  { term: 'ai training', score: 40 },
  { term: 'model rater', score: 40 },
  { term: 'ai rater', score: 40 },
  { term: 'annotation specialist', score: 40 },
];

export const DESCRIPTION_POSITIVE_TERMS: WeightedTerm[] = [
  { term: 'rlhf', score: 25 },
  { term: 'ai training', score: 20 },
  { term: 'human feedback', score: 20 },
  { term: 'llm evaluation', score: 20 },
  { term: 'model response evaluation', score: 20 },
  { term: 'evaluate model', score: 18 },
  { term: 'evaluate llm', score: 18 },
  { term: 'prompt evaluation', score: 18 },
  { term: 'data annotation', score: 18 },
  { term: 'annotation', score: 15 },
  { term: 'ai trainer', score: 18 },
  { term: 'ai evaluator', score: 18 },
  { term: 'subject matter expert', score: 12 },
  { term: 'domain expert', score: 12 },
  { term: 'human in the loop', score: 18 },
  { term: 'human-in-the-loop', score: 18 },
  { term: 'ai-generated', score: 18 },
  { term: 'ai generated', score: 18 },
  { term: 'evaluate ai', score: 18 },
  { term: 'frontier model', score: 18 },
  { term: 'model outputs', score: 15 },
  { term: 'label training data', score: 15 },
  { term: 'rate model', score: 15 },
];

export const CONTEXT_BONUS_TERMS: WeightedTerm[] = [
  { term: 'remote', score: 5 },
  { term: 'contract', score: 5 },
  { term: 'part-time', score: 5 },
  { term: 'part time', score: 5 },
];

export const NEGATIVE_TITLE_TERMS = [
  'software engineer',
  'software developer',
  'backend engineer',
  'frontend engineer',
  'full stack engineer',
  'fullstack engineer',
  'devops engineer',
  'site reliability',
  'machine learning engineer',
  'ml engineer',
  'data engineer',
  'data scientist',
  'research scientist',
  'product manager',
  'engineering manager',
  'account executive',
  'sales engineer',
  'solutions architect',
];

export const TITLE_OVERRIDE_TERMS = [
  'ai trainer',
  'ai training',
  'ai evaluator',
  'llm evaluator',
  'rlhf',
  'annotat',
  'domain expert',
  'subject matter expert',
  'coding expert',
  'ai evaluation',
  'human feedback',
  'prompt evaluator',
  'model evaluator',
];

export const CATEGORY_RULES: Array<{ category: JobCategory; patterns: string[] }> = [
  {
    category: 'Coding',
    patterns: ['coding', 'software', 'programming', 'python', 'javascript', 'code review', 'engineer expert', 'developer expert'],
  },
  {
    category: 'Writing',
    patterns: ['writer', 'writing', 'editor', 'editorial', 'content reviewer', 'copywrit'],
  },
  {
    category: 'Math',
    patterns: ['math', 'mathematic', 'statistics', 'quantitative'],
  },
  {
    category: 'Science',
    patterns: ['science', 'biology', 'chemistry', 'physics', 'scientific'],
  },
  {
    category: 'Legal',
    patterns: ['legal', 'law ', 'attorney', 'counsel', 'lawyer'],
  },
  {
    category: 'Finance',
    patterns: ['finance', 'financial', 'accounting', 'banking', 'investment'],
  },
  {
    category: 'Healthcare',
    patterns: ['health', 'medical', 'clinical', 'physician', 'nurse', 'pharma'],
  },
  {
    category: 'Language',
    patterns: ['linguist', 'translation', 'translator', 'bilingual', 'language expert'],
  },
  {
    category: 'Data Annotation',
    patterns: ['annotat', 'labeling', 'labelling', 'data label'],
  },
  {
    category: 'AI Evaluation',
    patterns: ['evaluator', 'evaluation', 'rater', 'rating', 'quality reviewer', 'quality specialist', 'rlhf', 'human feedback'],
  },
  {
    category: 'General AI Training',
    patterns: ['ai trainer', 'ai training', 'ai tutor', 'human in the loop', 'human-in-the-loop'],
  },
];
