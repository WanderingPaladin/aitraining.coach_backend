import { PrismaClient } from '@prisma/client';
import { ensureMarketplaceSources } from '../src/modules/job-collector/marketplace-sources.js';
import { ensureCuratedOpportunities } from '../src/modules/opportunities/ensure-seed.js';

const prisma = new PrismaClient();

const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

async function seedAvailability() {
  const existing = await prisma.availabilityRule.count();
  if (existing > 0) {
    console.log(`Availability already seeded (${existing} rules). Skipping.`);
    return;
  }

  await prisma.availabilityRule.createMany({
    data: WEEKDAYS_MON_FRI.map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'America/New_York',
      slotMinutes: 30,
      bufferMinutes: 0,
      isActive: true,
    })),
  });

  console.log('Seeded Mon–Fri 09:00–17:00 America/New_York intro-call windows.');
}

async function seedOpportunities() {
  const result = await ensureCuratedOpportunities();
  console.log(
    `Curated opportunities: created ${result.created}, reopened ${result.reopened}.`,
  );
}

async function seedMarketplaceSources() {
  const result = await ensureMarketplaceSources();
  console.log(`Marketplace job sources: created ${result.created}, updated ${result.updated}.`);
}

async function main() {
  await seedAvailability();
  await seedOpportunities();
  await seedMarketplaceSources();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
