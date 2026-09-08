const SET_KEY = '__questionSet';

export function encodeQuestionSet(ids: string[]): Record<string, string> {
  return { [SET_KEY]: ids.join(',') };
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

export function publicAnswers(answers: unknown): Record<string, string> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(answers as Record<string, unknown>)) {
    if (key === SET_KEY) continue;
    if (typeof item === 'string') out[key] = item;
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item);
  }
  return out;
}

export function mergeAnswers(
  existing: unknown,
  incoming: Record<string, string>,
  questionIds: string[],
): Record<string, string> {
  return {
    ...encodeQuestionSet(questionIds),
    ...publicAnswers(existing),
    ...incoming,
  };
}
