export const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  confusing: 'Something was confusing',
  improvement: 'Suggest an improvement',
  problem: 'Report a problem',
  general: 'Share general feedback',
  question: 'Ask a quick question',
};

export const FEEDBACK_SUBCATEGORY_LABELS: Record<string, string> = {
  how_it_works: 'Understand how AI Trainers works',
  apply: 'Apply',
  book_call: 'Book a call',
  opportunities: 'Find opportunities',
  profile: 'Understand my profile',
  profile_match: 'Profile / Match',
  navigation: 'Website navigation',
  application: 'Application process',
  booking: 'Booking',
  coaching: 'Coaching information',
  page_not_loading: 'Page not loading',
  button_not_working: 'Button not working',
  form_issue: 'Form issue',
  booking_issue: 'Booking issue',
  login_account: 'Login/account issue',
  opportunity_issue: 'Opportunity issue',
  visual_layout: 'Visual/layout issue',
  other: 'Something else',
};

export function feedbackCategoryLabel(category: string): string {
  return FEEDBACK_CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export function feedbackSubcategoryLabel(subcategory: string | null | undefined): string | null {
  if (!subcategory) return null;
  return FEEDBACK_SUBCATEGORY_LABELS[subcategory] ?? subcategory.replace(/_/g, ' ');
}

export function feedbackSummaryLine(input: {
  category: string;
  subcategory?: string | null;
}): string {
  const sub = feedbackSubcategoryLabel(input.subcategory);
  const category = feedbackCategoryLabel(input.category);
  return sub ? `${sub} · ${category}` : category;
}
