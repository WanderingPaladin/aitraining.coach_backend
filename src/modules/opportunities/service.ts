import type { Opportunity, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { canScoreMatch, scoreOpportunity, type MatchProfile } from '../../lib/matchScore.js';
import { recordAccountActivity } from '../auth/service.js';

export function serializeOpportunity(
  opportunity: Opportunity,
  extras?: {
    match?: ReturnType<typeof scoreOpportunity>;
    saved?: boolean;
  },
) {
  return {
    id: opportunity.id,
    sourcePlatform: opportunity.sourcePlatform,
    sourceUrl: opportunity.sourceUrl,
    title: opportunity.title,
    summary: opportunity.summary,
    category: opportunity.category,
    skills: opportunity.skills,
    experienceRequirement: opportunity.experienceRequirement,
    location: opportunity.location,
    remoteStatus: opportunity.remoteStatus,
    compensationText: opportunity.compensationText,
    beginnerFriendly: opportunity.beginnerFriendly,
    eligibility: opportunity.eligibility,
    postedAt: opportunity.postedAt?.toISOString() ?? null,
    firstSeenAt: opportunity.firstSeenAt.toISOString(),
    lastVerifiedAt: opportunity.lastVerifiedAt.toISOString(),
    status: opportunity.status,
    saved: extras?.saved ?? false,
    match: extras?.match ?? null,
  };
}

export async function listOpportunities(input: {
  q: string;
  platform: string;
  category: string;
  beginnerFriendly?: boolean;
  remote?: boolean;
  sort: 'newest' | 'match';
  limit: number;
  userId?: string;
  matchProfile?: MatchProfile | null;
}) {
  const where: Prisma.OpportunityWhereInput = {
    status: 'open',
    ...(input.platform ? { sourcePlatform: input.platform } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.beginnerFriendly != null ? { beginnerFriendly: input.beginnerFriendly } : {}),
    ...(input.remote ? { remoteStatus: 'remote' } : {}),
  };

  const opportunities = await prisma.opportunity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const query = input.q.trim().toLowerCase();
  const filtered = query
    ? opportunities.filter((item) => {
        const hay = [
          item.title,
          item.summary,
          item.category,
          item.sourcePlatform,
          ...item.skills,
          item.experienceRequirement ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      })
    : opportunities;

  const savedIds = new Set<string>();
  if (input.userId) {
    const saved = await prisma.savedOpportunity.findMany({
      where: { userId: input.userId, opportunityId: { in: filtered.map((item) => item.id) } },
      select: { opportunityId: true },
    });
    for (const row of saved) {
      savedIds.add(row.opportunityId);
    }
  }

  const canMatch = Boolean(input.matchProfile && canScoreMatch(input.matchProfile));
  const scored = filtered.map((item) => {
    const match =
      canMatch && input.matchProfile ? scoreOpportunity(input.matchProfile, item) : null;
    return serializeOpportunity(item, { match, saved: savedIds.has(item.id) });
  });

  if (input.sort === 'match' && canMatch) {
    scored.sort((left, right) => (right.match?.score ?? -1) - (left.match?.score ?? -1));
  }

  const platforms = [...new Set(opportunities.map((item) => item.sourcePlatform))].sort();
  const categories = [...new Set(opportunities.map((item) => item.category))].sort();

  return {
    opportunities: scored.slice(0, input.limit),
    filters: { platforms, categories },
    matchAvailable: canMatch,
  };
}

export async function saveOpportunity(userId: string, opportunityId: string) {
  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity || opportunity.status !== 'open') {
    throw notFound('OPPORTUNITY_NOT_FOUND', 'Opportunity not found');
  }
  await prisma.savedOpportunity.upsert({
    where: { userId_opportunityId: { userId, opportunityId } },
    update: {},
    create: { userId, opportunityId },
  });
  await recordAccountActivity(userId, 'opportunity_saved', `Saved ${opportunity.title}`);
  return serializeOpportunity(opportunity, { saved: true });
}

export async function unsaveOpportunity(userId: string, opportunityId: string) {
  await prisma.savedOpportunity.deleteMany({ where: { userId, opportunityId } });
  return { ok: true };
}

export async function listSavedOpportunities(userId: string, matchProfile?: MatchProfile | null, take = 24) {
  const rows = await prisma.savedOpportunity.findMany({
    where: { userId },
    include: { opportunity: true },
    orderBy: { createdAt: 'desc' },
    take,
  });
  const canMatch = Boolean(matchProfile && canScoreMatch(matchProfile));
  return rows.map((row) =>
    serializeOpportunity(row.opportunity, {
      saved: true,
      match: canMatch && matchProfile ? scoreOpportunity(matchProfile, row.opportunity) : null,
    }),
  );
}
