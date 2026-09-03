import type { JobSourceType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';

export const MARKETPLACE_SOURCES: Array<{
  companyName: string;
  companySlug: string;
  sourceType: JobSourceType;
  boardToken: string;
  careersUrl: string;
  priority: number;
}> = [
  {
    companyName: 'micro1',
    companySlug: 'micro1',
    sourceType: 'custom',
    boardToken: 'micro1',
    careersUrl: 'https://jobs.micro1.ai',
    priority: 40,
  },
  {
    companyName: 'Mercor',
    companySlug: 'mercor',
    sourceType: 'custom',
    boardToken: 'mercor',
    careersUrl: 'https://work.mercor.com/explore',
    priority: 40,
  },
];

export async function ensureMarketplaceSources(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const item of MARKETPLACE_SOURCES) {
    const existing = await prisma.jobSource.findFirst({
      where: {
        OR: [{ companySlug: item.companySlug }, { sourceType: item.sourceType, boardToken: item.boardToken }],
      },
    });
    if (existing) {
      await prisma.jobSource.update({
        where: { id: existing.id },
        data: {
          enabled: true,
          companyName: existing.companyName || item.companyName,
          careersUrl: item.careersUrl,
          sourceType: item.sourceType,
          boardToken: item.boardToken,
          lastCrawledAt: null,
        },
      });
      updated += 1;
      continue;
    }
    await prisma.jobSource.create({
      data: {
        companyName: item.companyName,
        companySlug: item.companySlug,
        sourceType: item.sourceType,
        boardToken: item.boardToken,
        careersUrl: item.careersUrl,
        enabled: true,
        priority: item.priority,
        crawlFrequencyMinutes: 360,
      },
    });
    created += 1;
  }
  await prisma.jobSource.updateMany({
    where: {
      OR: [
        { sourceType: 'ashby', boardToken: 'mercor' },
        { sourceType: 'greenhouse', boardToken: 'snorkelai' },
      ],
    },
    data: { enabled: false },
  });
  return { created, updated };
}
