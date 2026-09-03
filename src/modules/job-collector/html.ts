const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'a',
  'span',
  'div',
]);

const VOID_TAGS = new Set(['br']);

function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(raw: string): string | null {
  const href = decodeAttr(raw).trim();
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString();
      }
    } catch {
      return null;
    }
  }
  if (href.startsWith('/') && !href.startsWith('//')) {
    return href;
  }
  return null;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(value: string): string {
  return escapeText(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '$1');
}

/** Conservative Markdown subset for marketplace descriptions. Output is passed through sanitizeJobHtml. */
export function markdownToJobHtml(markdown: string): string {
  const source = markdown.replace(/\r\n/g, '\n').trim();
  if (!source) {
    return '';
  }
  const blocks = source.split(/\n{2,}/);
  const html: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? '');
    if (heading) {
      const marks = heading[1] ?? '#';
      const level = Math.min(marks.length + 1, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
      lines.shift();
      if (lines.length === 0) {
        continue;
      }
    }
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      html.push(`<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`);
      continue;
    }
    html.push(`<p>${lines.map((line) => inlineMarkdown(line)).join('<br />')}</p>`);
  }
  return sanitizeJobHtml(html.join(''));
}

export function sanitizeJobHtml(html: string): string {
  if (!html) {
    return '';
  }
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '');

  return stripped.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    const closing = full.startsWith('</');
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }
    if (closing) {
      return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
    }
    if (tag === 'br') {
      return '<br />';
    }
    if (tag === 'a') {
      const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const href = hrefMatch ? safeHref(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '') : null;
      if (!href) {
        return '';
      }
      return `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">`;
    }
    return `<${tag}>`;
  });
}

export function escapeJsonLd(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
