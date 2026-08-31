export const PIPELINE_STAGES = [
  'NEW',
  'REVIEWING',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'QUALIFIED',
  'ONBOARDING',
  'REJECTED',
  'ARCHIVED',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_LABELS: Record<PipelineStageName, string> = {
  NEW: 'New',
  REVIEWING: 'Reviewing',
  CONTACTED: 'Contacted',
  DEMO_SCHEDULED: 'Demo',
  QUALIFIED: 'Qualified',
  ONBOARDING: 'Onboarding',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export const SITUATION_LABELS = {
  new_no_account: 'Wants to get started',
  has_accounts_no_time: 'Has account, needs support',
  working_no_progress: 'Working, not progressing',
} as const;

export type ApplicantStageName = keyof typeof SITUATION_LABELS;

export function situationLabel(stage: ApplicantStageName | null | undefined): string | null {
  if (!stage) {
    return null;
  }
  return SITUATION_LABELS[stage];
}

export function experienceLabel(years: number): string {
  if (years <= 0) {
    return 'New to AI training';
  }
  if (years >= 4) {
    return '3+ years';
  }
  return `${years} year${years === 1 ? '' : 's'}`;
}

export function sanitizeNoteBody(value: string): string {
  return value.replace(/\0/g, '').replace(/\s+\n/g, '\n').trim();
}

export function sanitizeTag(value: string): string {
  return value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function sanitizeAssignee(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : null;
}

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = sanitizeTag(raw);
    if (!tag) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
    if (result.length >= 20) {
      break;
    }
  }
  return result;
}

export function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
