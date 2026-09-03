import { prisma } from '../../db/prisma.js';
import { OPPORTUNITY_SEED } from './seed-data.js';

export async function ensureCuratedOpportunities(): Promise<{ created: number; reopened: number }> {
  let created = 0;
  let reopened = 0;
  for (const item of OPPORTUNITY_SEED) {
    const existing = await prisma.opportunity.findFirst({
      where: { sourcePlatform: item.sourcePlatform, title: item.title },
    });
    if (!existing) {
      await prisma.opportunity.create({
        data: {
          sourcePlatform: item.sourcePlatform,
          sourceUrl: item.sourceUrl,
          title: item.title,
          summary: item.summary,
          category: item.category,
          skills: [...item.skills],
          experienceRequirement: item.experienceRequirement,
          location: item.location,
          remoteStatus: item.remoteStatus,
          beginnerFriendly: item.beginnerFriendly,
          eligibility: item.eligibility,
          lastVerifiedAt: new Date(),
        },
      });
      created += 1;
      continue;
    }
    if (existing.status !== 'open') {
      await prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          status: 'open',
          lastVerifiedAt: new Date(),
          sourceUrl: item.sourceUrl,
          summary: item.summary,
        },
      });
      reopened += 1;
    }
  }
  return { created, reopened };
}
