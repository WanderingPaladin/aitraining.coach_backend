import { PrismaClient } from '@prisma/client';
import { OPPORTUNITY_SEED } from '../src/modules/opportunities/seed-data.js';

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
  const existing = await prisma.opportunity.count();
  if (existing > 0) {
    console.log(`Opportunities already seeded (${existing} listings). Skipping.`);
    return;
  }

  await prisma.opportunity.createMany({
    data: OPPORTUNITY_SEED.map((item) => ({
      ...item,
      lastVerifiedAt: new Date(),
    })),
  });

  console.log(`Seeded ${OPPORTUNITY_SEED.length} curated AI-training opportunities.`);
}

async function main() {
  await seedAvailability();
  await seedOpportunities();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
