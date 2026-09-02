import { createHash } from 'node:crypto';

function normalizePunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ');
}

function normalizeRemoteWording(value: string): string {
  return value
    .replace(/\bwork from home\b/g, 'remote')
    .replace(/\bwfh\b/g, 'remote')
    .replace(/\btelecommut(?:e|ing)?\b/g, 'remote')
    .replace(/\bfully remote\b/g, 'remote')
    .replace(/\bremote[-\s]?first\b/g, 'remote')
    .replace(/\banywhere\b/g, 'remote');
}

export function normalizeFingerprintPart(value: string | null | undefined): string {
  const raw = (value ?? '').toLowerCase().trim();
  if (!raw) {
    return '';
  }
  return normalizeRemoteWording(normalizePunctuation(raw)).replace(/\s+/g, ' ').trim();
}

export function buildFingerprintKey(input: {
  companyName: string;
  title: string;
  location?: string | null;
}): string {
  return [
    normalizeFingerprintPart(input.companyName),
    normalizeFingerprintPart(input.title),
    normalizeFingerprintPart(input.location),
  ].join('|');
}

export function fingerprintJob(input: {
  companyName: string;
  title: string;
  location?: string | null;
}): string {
  return createHash('sha256').update(buildFingerprintKey(input)).digest('hex');
}
