export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stripHtml(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return collapseWhitespace(
    withoutBlocks
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&apos;/gi, "'"),
  );
}

export function slugify(value: string, max = 80): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'job';
}

export function makeJobSlug(title: string, company: string, externalId: string): string {
  const base = slugify(`${title} ${company}`, 72);
  const suffix = slugify(externalId, 16);
  return `${base}-${suffix}`.replace(/-+/g, '-').slice(0, 96);
}

export function asString(value: unknown): string {
  if (typeof value === 'string') {
    return collapseWhitespace(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

export function asOptionalString(value: unknown): string | null {
  const text = asString(value);
  return text || null;
}

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[,$]/g, ''));
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

export function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1e12 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = asOptionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

export function excerptDescription(text: string | null | undefined, max = 220): string | null {
  const cleaned = collapseWhitespace(text ?? '');
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= max) {
    return cleaned;
  }
  const slice = cleaned.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = slice.slice(0, lastSpace > Math.floor(max * 0.6) ? lastSpace : max).trim();
  return `${trimmed}…`;
}
