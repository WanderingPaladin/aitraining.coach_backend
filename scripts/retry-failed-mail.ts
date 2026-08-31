import { config } from '../src/config.js';
import { prisma } from '../src/db/prisma.js';
import { sendApplicationReceived, sendBookingConfirmation } from '../src/lib/mailer.js';
import { experienceLabel, situationLabel } from '../src/modules/admin/labels.js';

function isDeliverable(email: string): boolean {
  const lower = email.toLowerCase();
  return !lower.endsWith('@example.com') && !lower.endsWith('.example');
}

async function main() {
  const applications = await prisma.application.findMany({
    include: { bookings: { where: { status: 'confirmed' } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`MAIL_FROM=${config.MAIL_FROM}`);
  console.log(`Found ${applications.length} application(s)`);

  for (const application of applications) {
    if (!isDeliverable(application.email)) {
      console.log(`skip application ${application.email} (undeliverable test address)`);
      continue;
    }

    console.log(`resend apply → ${application.email} (${application.fullName})`);
    await sendApplicationReceived({
      email: application.email,
      firstName: application.firstName,
      fullName: application.fullName,
      phone: application.phone,
      city: application.city,
      state: application.state,
      profession: application.profession,
      experience: experienceLabel(application.yearsOfExperience),
      situation: situationLabel(application.applicantStage),
      referralSource: application.referralSource,
      timezone: application.timezone,
      usEligible: application.usEligibilityConfirmed,
      ipLocation: application.ipLocation,
    });

    for (const booking of application.bookings) {
      console.log(`resend booking ${booking.id} → ${application.email} + ${config.COACH_EMAIL}`);
      await sendBookingConfirmation({
        candidateEmail: application.email,
        candidateName: application.fullName,
        candidateTimezone: application.timezone,
        bookingId: booking.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        meetingUrl: booking.meetingUrl ?? config.INTRO_CALL_MEETING_URL,
        cancelToken: booking.cancelToken,
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
