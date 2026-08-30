export const professions = [
  'Software',
  'Finance',
  'Writing',
  'Science',
  'Legal',
  'Education',
  'Healthcare',
  'Research',
  'Marketing',
  'Other',
] as const;

export const experienceYearValues = [0, 1, 2, 3, 4] as const;

export function isValidExperienceYears(value: number): boolean {
  return (experienceYearValues as readonly number[]).includes(value);
}

export const usStateCodes = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY',
] as const;

const CITY_RE = /^[A-Za-z][A-Za-z .'-]{1,78}[A-Za-z.]$|^[A-Za-z]{2,80}$/;

const RESERVED_EMAIL_TLDS = new Set([
  'example',
  'invalid',
  'local',
  'localhost',
  'test',
  'internal',
  'lan',
]);

const RESERVED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'invalid.com',
]);

const NATIONAL_LENGTH_BY_DIAL: Record<string, number[]> = {
  '1': [10],
  '20': [10],
  '27': [9],
  '31': [9],
  '32': [9],
  '33': [9],
  '34': [9],
  '39': [9, 10],
  '40': [9],
  '41': [9],
  '43': [10, 11],
  '44': [10],
  '45': [8],
  '46': [9],
  '47': [8],
  '48': [9],
  '49': [10, 11],
  '51': [9],
  '52': [10],
  '54': [10],
  '55': [10, 11],
  '56': [9],
  '57': [10],
  '60': [9, 10],
  '61': [9],
  '62': [10, 11],
  '63': [10],
  '64': [8, 9, 10],
  '65': [8],
  '66': [9],
  '81': [10],
  '82': [9, 10],
  '84': [9],
  '86': [11],
  '90': [10],
  '91': [10],
  '92': [10],
  '233': [9],
  '234': [10],
  '254': [9],
  '351': [9],
  '353': [9],
  '358': [9, 10],
  '380': [9],
  '420': [9],
  '852': [8],
  '880': [10],
  '886': [9],
  '966': [9],
  '971': [9],
  '972': [9],
};

const DIALS_LONGEST_FIRST = Object.keys(NATIONAL_LENGTH_BY_DIAL).sort(
  (left, right) => right.length - left.length,
);

export function isValidEmailAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || email.includes('..') || email.includes(' ')) {
    return false;
  }
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) {
    return false;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length < 1 || local.length > 64 || domain.length < 4 || domain.length > 253) {
    return false;
  }
  if (!/^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?$/.test(local) && !/^[a-z0-9]$/.test(local)) {
    return false;
  }
  const labels = domain.split('.');
  if (labels.length < 2) {
    return false;
  }
  const tld = labels[labels.length - 1];
  if (!tld || !/^[a-z]{2,63}$/.test(tld) || RESERVED_EMAIL_TLDS.has(tld)) {
    return false;
  }
  if (
    RESERVED_EMAIL_DOMAINS.has(domain) ||
    [...RESERVED_EMAIL_DOMAINS].some((reserved) => domain.endsWith(`.${reserved}`))
  ) {
    return false;
  }
  return labels.slice(0, -1).every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function isValidCityName(value: string): boolean {
  const city = value.trim().replace(/\s+/g, ' ');
  if (city.length < 2 || city.length > 80 || /\d/.test(city)) {
    return false;
  }
  return CITY_RE.test(city);
}

function isValidNanpNational(national: string): boolean {
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) {
    return false;
  }
  const area = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  const subscriber = national.slice(6);
  if (area === '555' || (area[1] === '1' && area[2] === '1')) {
    return false;
  }
  if (exchange[1] === '1' && exchange[2] === '1') {
    return false;
  }
  if (exchange === '555' && subscriber.startsWith('01')) {
    return false;
  }
  return new Set(national).size >= 3;
}

function isPlausibleNational(dial: string, national: string): boolean {
  if (national.length < 6 || /^(\d)\1+$/.test(national)) {
    return false;
  }
  if (national.length >= 8 && new Set(national).size < 3) {
    return false;
  }
  if (dial === '1') {
    return isValidNanpNational(national);
  }
  if (dial === '91') {
    return /^[6-9]\d{9}$/.test(national);
  }
  if (dial === '44') {
    return /^[1-9]\d{9}$/.test(national);
  }
  if (dial === '61') {
    return /^[2-478]\d{8}$/.test(national);
  }
  if (dial === '33' || dial === '34' || dial === '39' || dial === '49') {
    return /^[1-9]\d+$/.test(national);
  }
  return true;
}

export function isValidE164Phone(value: string): boolean {
  const phone = value.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return false;
  }
  const digits = phone.slice(1);
  for (const dial of DIALS_LONGEST_FIRST) {
    if (!digits.startsWith(dial)) {
      continue;
    }
    const national = digits.slice(dial.length);
    const lengths = NATIONAL_LENGTH_BY_DIAL[dial];
    if (lengths?.includes(national.length) && isPlausibleNational(dial, national)) {
      return true;
    }
  }
  return false;
}
