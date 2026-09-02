import { asOptionalString, collapseWhitespace } from './text.js';

const US_STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

export type ParsedLocation = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  remoteType: string | null;
};

function looksRemote(value: string): boolean {
  return /\b(remote|work from home|wfh|telecommut|anywhere|distributed)\b/i.test(value);
}

function looksHybrid(value: string): boolean {
  return /\bhybrid\b/i.test(value);
}

export function inferRemoteType(
  location: string | null,
  extras: Array<string | null | undefined> = [],
): string | null {
  const hay = [location, ...extras].filter(Boolean).join(' ');
  if (!hay) {
    return null;
  }
  if (looksRemote(hay) && looksHybrid(hay)) {
    return 'hybrid';
  }
  if (looksRemote(hay)) {
    return 'remote';
  }
  if (looksHybrid(hay)) {
    return 'hybrid';
  }
  if (/\b(on-?site|in-?office|office)\b/i.test(hay)) {
    return 'onsite';
  }
  return null;
}

export function parseLocation(raw: unknown, extras: Array<string | null | undefined> = []): ParsedLocation {
  const location = asOptionalString(raw);
  if (!location) {
    return {
      location: null,
      city: null,
      state: null,
      country: null,
      remoteType: inferRemoteType(null, extras),
    };
  }

  const cleaned = collapseWhitespace(location.replace(/\u00a0/g, ' '));
  const remoteType = inferRemoteType(cleaned, extras);
  const parts = cleaned
    .split(/[,|/•·]+/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (looksRemote(part) || looksHybrid(part)) {
      continue;
    }
    if (/^(united states|usa|us|u\.s\.a?\.?)$/i.test(part)) {
      country = 'United States';
      continue;
    }
    if (/^[A-Z]{2}$/.test(part)) {
      state = part;
      continue;
    }
    const mapped = US_STATES[lower];
    if (mapped) {
      state = mapped;
      continue;
    }
    if (/^[A-Za-z .'-]{2,}$/.test(part) && !country && /kingdom|canada|india|germany|ireland|australia/i.test(part)) {
      country = part;
      continue;
    }
    if (!city) {
      city = part;
    } else if (!country) {
      country = part;
    }
  }

  return { location: cleaned, city, state, country, remoteType };
}

export function normalizeEmploymentType(value: unknown): string | null {
  const text = asOptionalString(value);
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\bfull\s*time\b/.test(lower) || lower === 'fulltime') {
    return 'full-time';
  }
  if (/\bpart\s*time\b/.test(lower) || lower === 'parttime') {
    return 'part-time';
  }
  if (/\bcontract/.test(lower) || /\bcontractor\b/.test(lower)) {
    return 'contract';
  }
  if (/\btempor/.test(lower) || /\bintern/.test(lower)) {
    return lower.includes('intern') ? 'internship' : 'temporary';
  }
  if (/\bhourly\b/.test(lower) || /\bflex/.test(lower)) {
    return 'flexible';
  }
  return lower.slice(0, 40);
}
