import { describe, expect, it } from 'vitest';
import { feedbackCategoryLabel, feedbackSubcategoryLabel, feedbackSummaryLine } from '../src/modules/feedback/labels.js';

describe('feedback labels', () => {
  it('builds a human summary without dumping the record', () => {
    expect(feedbackCategoryLabel('confusing')).toBe('Something was confusing');
    expect(feedbackSubcategoryLabel('profile_match')).toBe('Profile / Match');
    expect(
      feedbackSummaryLine({ category: 'confusing', subcategory: 'profile_match' }),
    ).toBe('Profile / Match · Something was confusing');
  });
});
