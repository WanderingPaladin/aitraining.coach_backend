import type { AcquisitionSource } from './types.js';

const HOST_SOURCE: Record<string, AcquisitionSource> = {
  'google.com': 'google',
  'www.google.com': 'google',
  'google.co.uk': 'google',
  'bing.com': 'google',
  'www.bing.com': 'google',
  'reddit.com': 'reddit',
  'www.reddit.com': 'reddit',
  'old.reddit.com': 'reddit',
  'discord.com': 'discord',
  'discord.gg': 'discord',
  'linkedin.com': 'linkedin',
  'www.linkedin.com': 'linkedin',
  'twitter.com': 'twitter',
  'www.twitter.com': 'twitter',
  'x.com': 'twitter',
  'www.x.com': 'twitter',
  'facebook.com': 'facebook',
  'www.facebook.com': 'facebook',
  'l.facebook.com': 'facebook',
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'youtu.be': 'youtube',
};

const UTM_SOURCE_ALIASES: Record<string, AcquisitionSource> = {
  google: 'google',
  goog: 'google',
  adwords: 'google',
  cpc: 'google',
  reddit: 'reddit',
  discord: 'discord',
  linkedin: 'linkedin',
  twitter: 'twitter',
  x: 'twitter',
  facebook: 'facebook',
  fb: 'facebook',
  youtube: 'youtube',
  yt: 'youtube',
  direct: 'direct',
  referral: 'referral',
};

export type AttributionInput = {
  landingPage?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

export type Attribution = {
  landingPage: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  firstSource: string;
};

function clean(value: string | null | undefined, max = 500): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

function hostnameFromUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isOwnHost(host: string | null): boolean {
  if (!host) {
    return false;
  }
  return (
    host === 'aitrainers.coach' ||
    host === 'www.aitrainers.coach' ||
    host === 'aitrainersdev.netlify.app' ||
    host.endsWith('.aitrainers.coach') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

export function classifySource(input: AttributionInput): string {
  const utm = input.utmSource?.trim().toLowerCase();
  if (utm) {
    return UTM_SOURCE_ALIASES[utm] ?? utm.slice(0, 40);
  }
  const host = hostnameFromUrl(input.referrer ?? null);
  if (!host || isOwnHost(host)) {
    return input.referrer || utm ? 'direct' : 'direct';
  }
  const mapped = HOST_SOURCE[host] ?? HOST_SOURCE[`www.${host}`];
  if (mapped) {
    return mapped;
  }
  if (input.utmMedium?.trim().toLowerCase() === 'referral') {
    return 'referral';
  }
  return 'referral';
}

export function normalizeAttribution(input: AttributionInput): Attribution {
  const landingPage = clean(input.landingPage, 300) || '/';
  const referrer = clean(input.referrer, 500);
  const utmSource = clean(input.utmSource, 80)?.toLowerCase() ?? null;
  const utmMedium = clean(input.utmMedium, 80)?.toLowerCase() ?? null;
  const utmCampaign = clean(input.utmCampaign, 120) ?? null;
  const utmContent = clean(input.utmContent, 120) ?? null;
  const utmTerm = clean(input.utmTerm, 120) ?? null;
  return {
    landingPage,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    firstSource: classifySource({
      landingPage,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
    }),
  };
}

export function sourceLabel(source: string | null | undefined): string {
  if (!source) {
    return 'Unknown';
  }
  const labels: Record<string, string> = {
    google: 'Google',
    reddit: 'Reddit',
    discord: 'Discord',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
    facebook: 'Facebook',
    youtube: 'YouTube',
    direct: 'Direct',
    referral: 'Referral',
    other: 'Other',
    unknown: 'Unknown',
  };
  if (labels[source]) {
    return labels[source];
  }
  return source.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
