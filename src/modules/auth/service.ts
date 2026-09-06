import type { AccountActivityType, ApplicantStage, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { buildAppUrl } from '../../lib/app-url.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { sendSafely } from '../../lib/mailer.js';
import { hashPassword, hashToken, randomToken, verifyPassword } from '../../lib/password.js';
import { linkVisitorToUser } from '../tracking/identity.js';

export function serializeUser(user: { id: string; email: string; emailVerifiedAt: Date | null }) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

async function recordActivity(userId: string, type: AccountActivityType, message: string) {
  await prisma.accountActivity.create({ data: { userId, type, message } });
}

export async function linkApplicationsForUser(userId: string, email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.emailVerifiedAt) {
    return;
  }

  const applications = await prisma.application.findMany({
    where: { email, userId: null },
    orderBy: { createdAt: 'desc' },
  });
  if (applications.length === 0) {
    return;
  }

  await prisma.application.updateMany({
    where: { id: { in: applications.map((item) => item.id) } },
    data: { userId },
  });

  const latest = applications[0]!;
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const patch: Prisma.ProfileUpdateInput = {};
  if (profile && !profile.firstName) patch.firstName = latest.firstName;
  if (profile && !profile.lastName) patch.lastName = latest.lastName;
  if (profile && !profile.phone) patch.phone = latest.phone;
  if (profile && !profile.city) patch.city = latest.city;
  if (profile && !profile.state) patch.state = latest.state;
  if (profile && !profile.profession) patch.profession = latest.profession;
  if (profile && !profile.timezone) patch.timezone = latest.timezone;
  if (profile && !profile.applicantStage && latest.applicantStage) {
    patch.applicantStage = latest.applicantStage as ApplicantStage;
  }
  if (profile && profile.yearsOfAiTraining === 0) patch.yearsOfAiTraining = latest.yearsOfExperience;
  if (profile && !profile.usEligibilityConfirmed && latest.usEligibilityConfirmed) {
    patch.usEligibilityConfirmed = true;
  }
  if (profile && Object.keys(patch).length > 0) {
    await prisma.profile.update({ where: { userId }, data: patch });
  }

  await recordActivity(userId, 'application_linked', 'Linked an existing AI Trainers application to this account');
  await linkVisitorToUser(userId);

  const booked = await prisma.booking.findFirst({
    where: { application: { userId }, status: 'confirmed' },
  });
  if (booked) {
    const already = await prisma.accountActivity.findFirst({
      where: { userId, type: 'intro_call_booked' },
    });
    if (!already) {
      await recordActivity(userId, 'intro_call_booked', 'Intro call booked');
    }
  }
}

export async function recordAccountActivity(
  userId: string,
  type: AccountActivityType,
  message: string,
): Promise<void> {
  await recordActivity(userId, type, message);
}

async function sendVerifyEmail(email: string, token: string): Promise<void> {
  const url = buildAppUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  await sendSafely({
    to: email,
    subject: 'Verify your AI Trainers account',
    text: `Confirm your email to finish setting up your AI Trainers account:\n${url}\n`,
    html: `<p>Confirm your email to finish setting up your AI Trainers account.</p><p><a href="${url}">Verify email</a></p>`,
  });
}

export async function registerUser(input: { email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('EMAIL_TAKEN', 'An account with that email already exists. Sign in instead.');
  }

  const token = randomToken();
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      emailVerifyTokenHash: hashToken(token),
      emailVerifyExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      profile: { create: {} },
    },
  });
  await recordActivity(user.id, 'account_created', 'Account created');
  await sendVerifyEmail(user.email, token);
  return user;
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw unauthorized('Email or password is incorrect');
  }
  if (user.emailVerifiedAt) {
    await linkApplicationsForUser(user.id, user.email);
  }
  return user;
}

export async function verifyEmail(token: string) {
  const user = await prisma.user.findFirst({
    where: { emailVerifyTokenHash: hashToken(token), emailVerifyExpiresAt: { gt: new Date() } },
  });
  if (!user) {
    throw unauthorized('This verification link is invalid or has expired');
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
  });
  await linkApplicationsForUser(updated.id, updated.email);
  return updated;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  const token = randomToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: hashToken(token),
      resetExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });
  const url = buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendSafely({
    to: email,
    subject: 'Reset your AI Trainers password',
    text: `Reset your password:\n${url}\nIf you did not ask for this, you can ignore the email.`,
    html: `<p><a href="${url}">Reset your password</a></p><p>If you did not ask for this, you can ignore the email.</p>`,
  });
}

export async function resetPassword(token: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: hashToken(token), resetExpiresAt: { gt: new Date() } },
  });
  if (!user) {
    throw unauthorized('This reset link is invalid or has expired');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      resetTokenHash: null,
      resetExpiresAt: null,
    },
  });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });
  return user;
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerifiedAt) {
    return;
  }
  const token = randomToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyTokenHash: hashToken(token),
      emailVerifyExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  await sendVerifyEmail(user.email, token);
}
