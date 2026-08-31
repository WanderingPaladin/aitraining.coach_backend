import { describe, expect, it } from 'vitest';
import {
  csvEscape,
  experienceLabel,
  sanitizeAssignee,
  sanitizeNoteBody,
  sanitizeTag,
  situationLabel,
  uniqueTags,
} from '../src/modules/admin/labels.js';

describe('situation labels', () => {
  it('normalizes applicant stages', () => {
    expect(situationLabel('new_no_account')).toBe('Wants to get started');
    expect(situationLabel('has_accounts_no_time')).toBe('Has account, needs support');
    expect(situationLabel('working_no_progress')).toBe('Working, not progressing');
    expect(situationLabel(null)).toBeNull();
  });
});

describe('experience labels', () => {
  it('uses the public form scale', () => {
    expect(experienceLabel(0)).toBe('New to AI training');
    expect(experienceLabel(1)).toBe('1 year');
    expect(experienceLabel(3)).toBe('3 years');
    expect(experienceLabel(4)).toBe('3+ years');
  });
});

describe('sanitizers', () => {
  it('rejects empty notes after trim', () => {
    expect(sanitizeNoteBody('   \n\t  ')).toBe('');
    expect(sanitizeNoteBody(' Follow up Friday ')).toBe('Follow up Friday');
  });

  it('dedupes tags case-insensitively', () => {
    expect(uniqueTags(['VIP', ' vip ', 'coach', ''])).toEqual(['VIP', 'coach']);
  });

  it('clears blank assignees', () => {
    expect(sanitizeAssignee('  Riley  ')).toBe('Riley');
    expect(sanitizeAssignee('   ')).toBeNull();
    expect(sanitizeTag('  intro-call  ')).toBe('intro-call');
  });

  it('escapes CSV fields', () => {
    expect(csvEscape('Hello, world')).toBe('"Hello, world"');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });
});
