import type { JourneyStage, PlatformProgressStatus } from '@prisma/client';

export const PUBLIC_EVENT_TYPES = [
  'site_visited',
  'page_view',
  'hero_cta_clicked',
  'application_started',
  'application_stage_selected',
  'booking_started',
  'booking_date_selected',
  'booking_time_selected',
  'profile_created',
  'profile_completed',
  'opportunity_viewed',
  'opportunity_saved',
  'opportunity_external_clicked',
] as const;

export const SERVER_EVENT_TYPES = [
  'application_submitted',
  'booking_confirmed',
  'intro_call_rescheduled',
  'intro_call_cancelled',
  'intro_call_attended',
  'intro_call_no_show',
  'platform_application_added',
  'platform_assessment_invited',
  'platform_assessment_started',
  'platform_assessment_completed',
  'platform_interview_invited',
  'platform_interview_scheduled',
  'platform_interview_completed',
  'platform_interview_passed',
  'platform_interview_rejected',
  'platform_project_started',
  'platform_project_ended',
  'candidate_inactive',
  'feedback_submitted',
] as const;

export type PublicEventType = (typeof PUBLIC_EVENT_TYPES)[number];
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];
export type CandidateEventType = PublicEventType | ServerEventType;

export const JOURNEY_STAGE_RANK: Record<JourneyStage, number> = {
  visitor: 0,
  application_started: 1,
  application_submitted: 2,
  intro_call_booked: 3,
  intro_call_attended: 4,
  coaching_started: 5,
  platform_applied: 6,
  platform_assessment: 7,
  platform_interview: 8,
  platform_interview_passed: 9,
  project_started: 10,
  inactive: -1,
};

export const EVENT_STAGE: Partial<Record<CandidateEventType, JourneyStage>> = {
  site_visited: 'visitor',
  page_view: 'visitor',
  application_started: 'application_started',
  application_submitted: 'application_submitted',
  booking_confirmed: 'intro_call_booked',
  intro_call_attended: 'intro_call_attended',
  intro_call_no_show: 'intro_call_booked',
  platform_application_added: 'platform_applied',
  platform_assessment_invited: 'platform_assessment',
  platform_assessment_started: 'platform_assessment',
  platform_assessment_completed: 'platform_assessment',
  platform_interview_invited: 'platform_interview',
  platform_interview_scheduled: 'platform_interview',
  platform_interview_completed: 'platform_interview',
  platform_interview_passed: 'platform_interview_passed',
  platform_project_started: 'project_started',
};

export const PLATFORM_STATUS_STAGE: Record<PlatformProgressStatus, JourneyStage | null> = {
  interested: null,
  applied: 'platform_applied',
  assessment_invited: 'platform_assessment',
  assessment_started: 'platform_assessment',
  assessment_completed: 'platform_assessment',
  interview_invited: 'platform_interview',
  interview_scheduled: 'platform_interview',
  interview_completed: 'platform_interview',
  passed: 'platform_interview_passed',
  rejected: 'platform_applied',
  waitlisted: 'platform_interview',
  project_received: 'project_started',
  working: 'project_started',
  inactive: null,
};

export const PLATFORM_STATUS_EVENT: Record<PlatformProgressStatus, ServerEventType | null> = {
  interested: null,
  applied: 'platform_application_added',
  assessment_invited: 'platform_assessment_invited',
  assessment_started: 'platform_assessment_started',
  assessment_completed: 'platform_assessment_completed',
  interview_invited: 'platform_interview_invited',
  interview_scheduled: 'platform_interview_scheduled',
  interview_completed: 'platform_interview_completed',
  passed: 'platform_interview_passed',
  rejected: 'platform_interview_rejected',
  waitlisted: 'platform_interview_scheduled',
  project_received: 'platform_project_started',
  working: 'platform_project_started',
  inactive: 'candidate_inactive',
};

export const FUNNEL_STAGES = [
  'visitors',
  'applications',
  'bookings',
  'attended',
  'platform_interviews',
  'passed',
  'projects',
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number];

export const KNOWN_SOURCES = [
  'google',
  'reddit',
  'discord',
  'linkedin',
  'twitter',
  'facebook',
  'youtube',
  'direct',
  'referral',
  'other',
  'unknown',
] as const;

export type AcquisitionSource = (typeof KNOWN_SOURCES)[number] | string;

export function higherStage(current: JourneyStage, next: JourneyStage | null | undefined): JourneyStage {
  if (!next || next === 'inactive') {
    return current;
  }
  return JOURNEY_STAGE_RANK[next] > JOURNEY_STAGE_RANK[current] ? next : current;
}

