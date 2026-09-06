const MIN_MEANINGFUL = 8;

export function isLowQualityFeedback(message: string): boolean {
  const text = message.trim();
  if (text.length < MIN_MEANINGFUL) {
    return false;
  }

  const compact = text.replace(/\s+/g, '');
  if (!compact) {
    return true;
  }

  const letters = compact.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) {
    return true;
  }

  const counts = new Map<string, number>();
  for (const char of compact.toLowerCase()) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  if (max / compact.length >= 0.85) {
    return true;
  }

  const normalized = compact.toLowerCase();
  for (let size = 1; size <= 4; size += 1) {
    const unit = normalized.slice(0, size);
    if (!unit) continue;
    const repeats = Math.floor(normalized.length / size);
    if (repeats < 6) continue;
    if (unit.repeat(repeats) === normalized.slice(0, size * repeats) && size * repeats === normalized.length) {
      return true;
    }
  }

  return false;
}

export function feedbackMessageIssue(message: string, hasRating: boolean): 'short' | 'low_quality' | null {
  const text = message.trim();
  if (!text) {
    return hasRating ? null : 'short';
  }
  if (isLowQualityFeedback(text)) {
    return 'low_quality';
  }
  if (text.length < MIN_MEANINGFUL && !hasRating) {
    return 'short';
  }
  return null;
}

export const FEEDBACK_QUALITY_COPY = {
  short: 'Please add a little more detail so we can understand your feedback.',
  low_quality: 'Please describe what happened or what you would like us to improve.',
} as const;
