const MIN_MEANINGFUL = 1;
const MAX_MESSAGE = 2000;

export function isLowQualityChatMessage(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return true;
  }

  const compact = text.replace(/\s+/g, '');
  if (!compact) {
    return true;
  }

  const letters = compact.replace(/[^a-zA-Z]/g, '');
  if (compact.length >= 12 && letters.length < 3) {
    return true;
  }

  const counts = new Map<string, number>();
  for (const char of compact.toLowerCase()) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  if (compact.length >= 10 && max / compact.length >= 0.9) {
    return true;
  }

  const normalized = compact.toLowerCase();
  for (let size = 1; size <= 4; size += 1) {
    const unit = normalized.slice(0, size);
    if (!unit) continue;
    const repeats = Math.floor(normalized.length / size);
    if (repeats < 8) continue;
    if (unit.repeat(repeats) === normalized.slice(0, size * repeats) && size * repeats === normalized.length) {
      return true;
    }
  }

  return false;
}

export function chatMessageIssue(message: string): 'empty' | 'low_quality' | 'too_long' | null {
  const text = message.trim();
  if (!text || text.length < MIN_MEANINGFUL) {
    return 'empty';
  }
  if (text.length > MAX_MESSAGE) {
    return 'too_long';
  }
  if (isLowQualityChatMessage(text)) {
    return 'low_quality';
  }
  return null;
}

export const CHAT_QUALITY_COPY = {
  empty: 'Type a message before sending.',
  too_long: 'Messages can be up to 2,000 characters.',
  low_quality: 'Please write a short message so we can help.',
} as const;

export { MAX_MESSAGE };
