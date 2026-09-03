import { prisma } from '../../db/prisma.js';

export async function closeCuratedOpportunities(): Promise<{ closed: number }> {
  const result = await prisma.opportunity.updateMany({
    where: { status: 'open' },
    data: { status: 'closed' },
  });
  return { closed: result.count };
}
