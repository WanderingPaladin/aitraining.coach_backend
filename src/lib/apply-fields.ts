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

export const usStateCodes = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY',
] as const;

const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i;
const CITY_RE = /^[A-Za-z][A-Za-z .'-]{1,78}[A-Za-z.]$|^[A-Za-z]{2,80}$/;

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

export function isValidEmailAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || email.includes('..')) {
    return false;
  }
  return EMAIL_RE.test(email);
}

export function isValidCityName(value: string): boolean {
  const city = value.trim().replace(/\s+/g, ' ');
  if (city.length < 2 || city.length > 80 || /\d/.test(city)) {
    return false;
  }
  return CITY_RE.test(city);
}

export function isValidE164Phone(value: string): boolean {
  const phone = value.replace(/[\s()-]/g, '');
  const match = /^\+([1-9]\d{0,3})(\d{4,14})$/.exec(phone);
  if (!match) {
    return false;
  }
  const dial = match[1];
  const national = match[2];
  if (!dial || !national) {
    return false;
  }
  const lengths = NATIONAL_LENGTH_BY_DIAL[dial];
  if (lengths) {
    return lengths.includes(national.length);
  }
  return national.length >= 6 && national.length <= 12;
}
