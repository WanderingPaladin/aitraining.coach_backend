const SET_KEY = '__questionSet';
const INDEX_KEY = '__currentIndex';

export function encodeQuestionSet(ids: string[]): Record<string, string> {
  return { [SET_KEY]: ids.join(',') };
}

export function encodeCurrentIndex(index: number): Record<string, string> {
  return { [INDEX_KEY]: String(Math.max(0, Math.floor(index))) };
}

export function readQuestionSet(answers: unknown, storedColumn?: unknown): string[] {
  if (Array.isArray(storedColumn)) {
    const fromColumn = storedColumn.filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (fromColumn.length) return fromColumn;
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return [];
  const raw = (answers as Record<string, unknown>)[SET_KEY];
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
  return [];
}

export function readCurrentIndex(answers: unknown): number | null {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  const raw = (answers as Record<string, unknown>)[INDEX_KEY];
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return null;
}

function isMetaKey(key: string) {
  return key === SET_KEY || key === INDEX_KEY;
}

export function publicAnswers(answers: unknown): Record<string, string> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(answers as Record<string, unknown>)) {
    if (isMetaKey(key)) continue;
    if (typeof item === 'string') out[key] = item;
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item);
  }
  return out;
}

export function mergeAnswers(
  existing: unknown,
  incoming: Record<string, string>,
  questionIds: string[],
  currentIndex?: number | null,
): Record<string, string> {
  const index = currentIndex ?? readCurrentIndex(existing);
  return {
    ...encodeQuestionSet(questionIds),
    ...publicAnswers(existing),
    ...incoming,
    ...(index == null ? {} : encodeCurrentIndex(index)),
  };
}
