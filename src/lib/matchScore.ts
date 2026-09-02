export type MatchProfile = {
  firstName?: string | null;
  profession?: string | null;
  specialties: string[];
  skills: string[];
  yearsDomainExperience?: number | null;
  yearsOfAiTraining?: number | null;
  usEligibilityConfirmed: boolean;
  weeklyAvailability?: string | null;
  platformsJoined: string[];
  platformStatus?: string | null;
  remotePreference?: string | null;
  desiredCategories: string[];
  city?: string | null;
  state?: string | null;
  applicantStage?: string | null;
  languages?: string[];
};

export type MatchOpportunity = {
  category: string;
  skills: string[];
  experienceRequirement?: string | null;
  location?: string | null;
  remoteStatus?: string | null;
  beginnerFriendly: boolean;
  eligibility?: string | null;
  sourcePlatform: string;
};

export type MatchReason = {
  kind: 'match' | 'gap' | 'hard';
  text: string;
};

export type OpportunityMatch = {
  score: number;
  label: string;
  reasons: MatchReason[];
  hardMismatches: string[];
};

export type ReadinessScore = {
  score: number;
  components: Array<{ key: string; label: string; score: number; max: number; hint?: string }>;
  completeEnough: boolean;
};

const WEIGHTS = {
  domain: 30,
  skills: 25,
  experience: 15,
  location: 10,
  availability: 10,
  platform: 5,
  completeness: 5,
} as const;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function overlap(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const rightSet = new Set(right.map(norm));
  const hits = left.filter((item) => rightSet.has(norm(item)) || [...rightSet].some((other) => norm(item).includes(other) || other.includes(norm(item))));
  return Math.min(1, hits.length / Math.max(1, Math.min(left.length, right.length)));
}

function professionAligns(profession: string | null | undefined, opportunity: MatchOpportunity): number {
  if (!profession) {
    return 0;
  }
  const hay = `${opportunity.category} ${opportunity.skills.join(' ')}`.toLowerCase();
  const prof = profession.toLowerCase();
  if (hay.includes(prof) || opportunity.category.toLowerCase() === prof) {
    return 1;
  }
  const map: Record<string, string[]> = {
    writing: ['writing', 'evaluation', 'editorial'],
    finance: ['finance', 'evaluation', 'research'],
    software: ['coding', 'evaluation', 'technical'],
    research: ['research', 'evaluation', 'science'],
    science: ['science', 'research', 'evaluation'],
    legal: ['legal', 'evaluation', 'writing'],
    education: ['education', 'writing', 'evaluation'],
    healthcare: ['healthcare', 'science', 'research'],
    marketing: ['writing', 'evaluation'],
  };
  const aliases = map[prof] ?? [];
  return aliases.some((alias) => hay.includes(alias)) ? 0.75 : 0.2;
}

export function canScoreMatch(profile: MatchProfile): boolean {
  return Boolean(
    profile.profession ||
      profile.specialties.length > 0 ||
      profile.skills.length > 0 ||
      profile.desiredCategories.length > 0,
  );
}

export function matchLabel(score: number): string {
  if (score >= 90) return 'Excellent Fit';
  if (score >= 80) return 'Strong Fit';
  if (score >= 70) return 'Good Fit';
  if (score >= 60) return 'Possible Fit';
  return 'Limited Fit';
}

function parseYears(requirement: string | null | undefined): number | null {
  if (!requirement) {
    return null;
  }
  const match = requirement.match(/(\d+)\s*\+?\s*year/i);
  if (match) {
    return Number(match[1]);
  }
  if (/no (prior )?experience|beginner|entry/i.test(requirement)) {
    return 0;
  }
  return null;
}

export function scoreOpportunity(profile: MatchProfile, opportunity: MatchOpportunity): OpportunityMatch | null {
  if (!canScoreMatch(profile)) {
    return null;
  }

  const parts: Array<{ key: keyof typeof WEIGHTS; weight: number; value: number }> = [];
  const reasons: MatchReason[] = [];
  const hardMismatches: string[] = [];

  const domainScore = Math.max(
    professionAligns(profile.profession, opportunity),
    overlap(profile.specialties, [opportunity.category, ...opportunity.skills]),
    overlap(profile.desiredCategories, [opportunity.category]),
  );
  parts.push({ key: 'domain', weight: WEIGHTS.domain, value: domainScore });
  if (domainScore >= 0.7 && profile.profession) {
    reasons.push({ kind: 'match', text: `${profile.profession} background aligns` });
  } else if (domainScore < 0.4) {
    reasons.push({ kind: 'gap', text: `Listing focuses on ${opportunity.category}` });
  }

  if (opportunity.skills.length > 0) {
    const skillScore = overlap(profile.skills, opportunity.skills);
    parts.push({ key: 'skills', weight: WEIGHTS.skills, value: skillScore });
    if (skillScore >= 0.5) {
      reasons.push({ kind: 'match', text: 'Skills overlap with the listing' });
    } else if (profile.skills.length === 0) {
      reasons.push({ kind: 'gap', text: 'Add skills to improve this match' });
    }
  }

  if (opportunity.experienceRequirement) {
    const requiredYears = parseYears(opportunity.experienceRequirement);
    const years = profile.yearsDomainExperience ?? profile.yearsOfAiTraining ?? 0;
    let value = 0.6;
    if (requiredYears == null) {
      value = opportunity.beginnerFriendly ? (years >= 0 ? 1 : 0.7) : 0.6;
    } else if (years >= requiredYears) {
      value = 1;
    } else if (opportunity.beginnerFriendly) {
      value = 0.7;
      reasons.push({ kind: 'gap', text: `Listing prefers ${requiredYears}+ years of domain experience` });
    } else {
      value = Math.max(0.2, years / Math.max(requiredYears, 1));
      reasons.push({ kind: 'gap', text: `Listing prefers ${requiredYears}+ years of domain experience` });
    }
    parts.push({ key: 'experience', weight: WEIGHTS.experience, value });
  }

  const eligibility = opportunity.eligibility ?? '';
  const needsUs = /u\.?s\.?|united states/i.test(eligibility);
  if (needsUs || opportunity.eligibility) {
    if (needsUs && !profile.usEligibilityConfirmed) {
      hardMismatches.push('Role typically requires U.S. eligibility');
      parts.push({ key: 'location', weight: WEIGHTS.location, value: 0 });
    } else if (needsUs && profile.usEligibilityConfirmed) {
      parts.push({ key: 'location', weight: WEIGHTS.location, value: 1 });
      reasons.push({ kind: 'match', text: 'U.S. eligibility matches' });
    }
  }

  if (opportunity.remoteStatus) {
    const remote = opportunity.remoteStatus.toLowerCase() === 'remote';
    const pref = profile.remotePreference?.toLowerCase();
    if (pref) {
      const value = remote && (pref === 'remote' || pref === 'any') ? 1 : pref === 'any' ? 0.7 : 0.45;
      parts.push({ key: 'availability', weight: WEIGHTS.availability, value });
      if (remote && (pref === 'remote' || pref === 'any')) {
        reasons.push({ kind: 'match', text: 'Remote preference matches' });
      }
    } else if (profile.weeklyAvailability) {
      parts.push({ key: 'availability', weight: WEIGHTS.availability, value: 0.8 });
    }
  } else if (profile.weeklyAvailability) {
    parts.push({ key: 'availability', weight: WEIGHTS.availability, value: 0.7 });
  }

  const platformName = opportunity.sourcePlatform.toLowerCase();
  const joined = profile.platformsJoined.some((item) => item.toLowerCase() === platformName);
  if (opportunity.sourcePlatform) {
    if (/must have|requires an account|existing account/i.test(eligibility) && !joined) {
      hardMismatches.push(`Listing expects a ${opportunity.sourcePlatform} account`);
      parts.push({ key: 'platform', weight: WEIGHTS.platform, value: 0 });
    } else {
      parts.push({ key: 'platform', weight: WEIGHTS.platform, value: joined || profile.platformStatus === 'active' ? 1 : 0.5 });
    }
  }

  const completeness =
    [
      profile.profession,
      profile.skills.length ? 'skills' : '',
      profile.weeklyAvailability,
      profile.platformsJoined.length ? 'platforms' : '',
      profile.usEligibilityConfirmed ? 'us' : '',
    ].filter(Boolean).length / 5;
  parts.push({ key: 'completeness', weight: WEIGHTS.completeness, value: completeness });

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight * 100);

  for (const mismatch of hardMismatches) {
    reasons.unshift({ kind: 'hard', text: mismatch });
  }

  return {
    score,
    label: matchLabel(score),
    reasons: reasons.slice(0, 4),
    hardMismatches,
  };
}

export function profileReadiness(profile: MatchProfile): ReadinessScore {
  const components: ReadinessScore['components'] = [
    {
      key: 'completeness',
      label: 'Professional Background',
      max: 25,
      score: profile.profession && (profile.city || profile.state) ? 25 : profile.profession ? 16 : 6,
      hint: profile.profession ? undefined : 'Add your profession',
    },
    {
      key: 'domain',
      label: 'Skills & Domain Detail',
      max: 20,
      score: profile.specialties.length && profile.skills.length ? 20 : profile.skills.length || profile.specialties.length ? 12 : 4,
      hint: profile.skills.length ? undefined : 'Add skills you use at work',
    },
    {
      key: 'skills',
      label: 'Availability',
      max: 10,
      score: profile.weeklyAvailability ? 10 : 2,
      hint: profile.weeklyAvailability ? undefined : 'Add weekly availability',
    },
    {
      key: 'platform',
      label: 'Platform Readiness',
      max: 10,
      score: profile.platformStatus === 'active' ? 10 : profile.platformsJoined.length ? 7 : 2,
      hint: profile.platformsJoined.length ? undefined : 'Add platform status',
    },
    {
      key: 'experience',
      label: 'AI Training Experience',
      max: 15,
      score: (profile.yearsOfAiTraining ?? 0) > 0 || profile.applicantStage === 'working_no_progress' ? 15 : profile.applicantStage ? 9 : 3,
    },
  ];

  const extraCompleteness = [
    profile.firstName ? 1 : 0,
    profile.usEligibilityConfirmed ? 1 : 0,
    profile.desiredCategories.length ? 1 : 0,
    profile.remotePreference ? 1 : 0,
    profile.languages?.length ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const completenessPoints = Math.round((extraCompleteness / 5) * 20) + (profile.profession ? 5 : 0);
  components.unshift({
    key: 'profile',
    label: 'Profile completeness',
    max: 25,
    score: Math.min(25, completenessPoints),
    hint: completenessPoints >= 20 ? undefined : 'Complete remaining profile fields',
  });

  // Keep the five displayed bars from the spec: completeness already prepended.
  // Spec: completeness 25, domain 20, skills 20, availability 10, platform 10, experience 15 = 100
  const display = [
    components.find((item) => item.key === 'profile')!,
    {
      key: 'domain',
      label: 'Domain specificity',
      max: 20,
      score: profile.specialties.length >= 2 ? 20 : profile.specialties.length || profile.profession ? 12 : 4,
      hint: profile.specialties.length ? undefined : 'Add your professional specialties',
    },
    {
      key: 'entered-skills',
      label: 'Skills entered',
      max: 20,
      score: profile.skills.length >= 3 ? 20 : profile.skills.length ? 12 : 4,
      hint: profile.skills.length ? undefined : 'Add skills you use at work',
    },
    components.find((item) => item.key === 'skills')!,
    components.find((item) => item.key === 'platform')!,
    components.find((item) => item.key === 'experience')!,
  ];

  const score = display.reduce((sum, item) => sum + item.score, 0);
  return {
    score,
    components: display,
    completeEnough: canScoreMatch(profile),
  };
}
