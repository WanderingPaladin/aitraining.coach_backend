import type { Prisma, Profile } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import {
  canScoreMatch,
  profileReadiness,
  type MatchProfile,
} from '../../lib/matchScore.js';
import { serializeUser } from '../auth/service.js';

export function toMatchProfile(profile: Profile): MatchProfile {
  return {
    firstName: profile.firstName,
    profession: profile.profession,
    specialties: profile.specialties,
    skills: profile.skills,
    yearsDomainExperience: profile.yearsDomainExperience,
    yearsOfAiTraining: profile.yearsOfAiTraining,
    usEligibilityConfirmed: profile.usEligibilityConfirmed,
    weeklyAvailability: profile.weeklyAvailability,
    platformsJoined: profile.platformsJoined,
    platformStatus: profile.platformStatus,
    remotePreference: profile.remotePreference,
    desiredCategories: profile.desiredCategories,
    city: profile.city,
    state: profile.state,
    applicantStage: profile.applicantStage,
    languages: profile.languages,
  };
}

export function serializeProfile(profile: Profile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    city: profile.city,
    state: profile.state,
    profession: profile.profession,
    timezone: profile.timezone,
    applicantStage: profile.applicantStage,
    yearsOfAiTraining: profile.yearsOfAiTraining,
    usEligibilityConfirmed: profile.usEligibilityConfirmed,
    yearsDomainExperience: profile.yearsDomainExperience,
    specialties: profile.specialties,
    skills: profile.skills,
    educationLevel: profile.educationLevel,
    desiredCategories: profile.desiredCategories,
    weeklyAvailability: profile.weeklyAvailability,
    platformsJoined: profile.platformsJoined,
    platformStatus: profile.platformStatus,
    remotePreference: profile.remotePreference,
    languages: profile.languages,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function getAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) {
    return null;
  }
  const profile = user.profile ?? (await prisma.profile.create({ data: { userId: user.id } }));
  const matchProfile = toMatchProfile(profile);
  return {
    user: serializeUser(user),
    profile: serializeProfile(profile),
    readiness: profileReadiness(matchProfile),
    canScoreMatch: canScoreMatch(matchProfile),
  };
}

export async function updateAccountProfile(
  userId: string,
  patch: Record<string, unknown>,
) {
  const existing = await prisma.profile.findUnique({ where: { userId } });
  if (!existing) {
    await prisma.profile.create({ data: { userId } });
  }
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }
  const profile = await prisma.profile.update({
    where: { userId },
    data: data as Prisma.ProfileUpdateInput,
  });
  return profile;
}

export async function listAccountActivity(userId: string, take = 12) {
  const items = await prisma.accountActivity.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    message: item.message,
    createdAt: item.createdAt.toISOString(),
  }));
}

export async function listLinkedApplications(userId: string) {
  const items = await prisma.application.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      firstName: true,
      lastName: true,
    },
  });
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    firstName: item.firstName,
    lastName: item.lastName,
  }));
}
