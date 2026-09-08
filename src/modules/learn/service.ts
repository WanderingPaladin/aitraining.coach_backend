import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { isUuid } from '../tracking/sanitize.js';
import { COURSE_SLUG, PASS_SCORE, publicQuestions } from './questions.js';
import {
  bandForCategory,
  categoryLabel,
  insightForCategory,
  levelForScore,
  LEVEL_COPY,
  recommendationsFor,
  sanitizeWritten,
  scoreAttempt,
  type ScoreLevel,
} from './score.js';
import type { ProgressBody, SaveAnswersBody, StartAttemptBody, SubmitAttemptBody } from './schema.js';
import { buildCertificatePdf, newCredentialId } from './pdf.js';
import type { ScoreCategory } from './questions.js';

type Identity = { userId: string | null; visitorId: string | null };

async function ensureVisitor(visitorId: string | null, userId: string | null) {
  if (!visitorId || !isUuid(visitorId)) return null;
  const existing = await prisma.visitor.findUnique({ where: { id: visitorId }, select: { id: true } });
  if (existing) return existing.id;
  await prisma.visitor.create({ data: { id: visitorId, userId: userId ?? undefined } });
  return visitorId;
}

function uniqueSorted(values: number[] | undefined) {
  return [...new Set((values ?? []).filter((value) => value >= 1 && value <= 6))].sort((a, b) => a - b);
}

async function findProgress(identity: Identity, courseSlug: string) {
  if (identity.userId) {
    const owned = await prisma.courseProgress.findFirst({
      where: { courseSlug, userId: identity.userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (owned) return owned;
  }
  if (identity.visitorId) {
    return prisma.courseProgress.findFirst({
      where: { courseSlug, visitorId: identity.visitorId },
      orderBy: { updatedAt: 'desc' },
    });
  }
  return null;
}

export function serializeProgress(row: {
  currentModule: number;
  completedModules: number[];
  startedModules: number[];
  quizResults: Prisma.JsonValue | null;
  lastLesson: string | null;
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}) {
  const completed = row.completedModules;
  const percent = Math.round((completed.length / 6) * 100);
  return {
    courseSlug: COURSE_SLUG,
    currentModule: row.currentModule,
    completedModules: completed,
    startedModules: row.startedModules,
    quizResults: row.quizResults,
    lastLesson: row.lastLesson,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    percent,
  };
}

export async function getProgress(identity: Identity, courseSlug = COURSE_SLUG) {
  const row = await findProgress(identity, courseSlug);
  if (!row) {
    return {
      courseSlug,
      currentModule: 1,
      completedModules: [] as number[],
      startedModules: [] as number[],
      quizResults: null,
      lastLesson: null,
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      percent: 0,
    };
  }
  return serializeProgress(row);
}

export async function saveProgress(identity: Identity, body: ProgressBody) {
  const visitorId = await ensureVisitor(identity.visitorId, identity.userId);
  if (!identity.userId && !visitorId) {
    throw badRequest('IDENTITY_REQUIRED', 'A visitor or account is required to save progress.');
  }
  const existing = await findProgress({ userId: identity.userId, visitorId }, body.courseSlug);
  const completedModules = uniqueSorted(body.completedModules ?? existing?.completedModules);
  const startedModules = uniqueSorted(body.startedModules ?? existing?.startedModules);
  const data = {
    userId: identity.userId,
    visitorId,
    courseSlug: body.courseSlug,
    currentModule: body.currentModule ?? existing?.currentModule ?? 1,
    completedModules,
    startedModules,
    quizResults: (body.quizResults ?? existing?.quizResults ?? undefined) as Prisma.InputJsonValue | undefined,
    lastLesson: body.lastLesson ?? existing?.lastLesson ?? null,
    completedAt:
      completedModules.length >= 6 || body.completedAt
        ? (existing?.completedAt ?? new Date())
        : (existing?.completedAt ?? null),
  };
  const row = existing
    ? await prisma.courseProgress.update({ where: { id: existing.id }, data })
    : await prisma.courseProgress.create({ data });
  return serializeProgress(row);
}

async function findAttempt(id: string, identity: Identity) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id },
    include: { certificate: true },
  });
  if (!attempt) throw notFound('ATTEMPT_NOT_FOUND', 'That assessment could not be found.');
  const allowed =
    (identity.userId && attempt.userId === identity.userId) ||
    (identity.visitorId && attempt.visitorId === identity.visitorId);
  if (!allowed) throw forbidden('That assessment is not available.');
  return attempt;
}

export async function startAttempt(identity: Identity, body: StartAttemptBody) {
  const visitorId = await ensureVisitor(identity.visitorId, identity.userId);
  if (!identity.userId && !visitorId) {
    throw badRequest('IDENTITY_REQUIRED', 'A visitor or account is required to start the assessment.');
  }
  if (body.attemptId) {
    const existing = await prisma.assessmentAttempt.findUnique({ where: { id: body.attemptId } });
    if (existing && !existing.submitted) {
      const allowed =
        (identity.userId && existing.userId === identity.userId) ||
        (visitorId && existing.visitorId === visitorId);
      if (allowed) {
        return {
          attempt: { id: existing.id, submitted: false, answers: existing.answers },
          questions: publicQuestions(),
        };
      }
    }
  }
  const open = await prisma.assessmentAttempt.findFirst({
    where: {
      courseSlug: body.courseSlug,
      submitted: false,
      OR: [
        ...(identity.userId ? [{ userId: identity.userId }] : []),
        ...(visitorId ? [{ visitorId }] : []),
      ],
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (open) {
    return { attempt: { id: open.id, submitted: false, answers: open.answers }, questions: publicQuestions() };
  }
  const created = await prisma.assessmentAttempt.create({
    data: {
      userId: identity.userId,
      visitorId,
      courseSlug: body.courseSlug,
      answers: {},
    },
  });
  return { attempt: { id: created.id, submitted: false, answers: {} }, questions: publicQuestions() };
}

export async function saveAnswers(id: string, identity: Identity, body: SaveAnswersBody) {
  const attempt = await findAttempt(id, identity);
  if (attempt.submitted) {
    throw badRequest('ALREADY_SUBMITTED', 'This assessment has already been submitted.');
  }
  const merged = { ...(asRecord(attempt.answers)), ...normalizeAnswers(body.answers) };
  const updated = await prisma.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { answers: merged as Prisma.InputJsonValue, visitorId: identity.visitorId ?? attempt.visitorId },
  });
  return { id: updated.id, answers: updated.answers };
}

function asRecord(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item;
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item);
  }
  return out;
}

function normalizeAnswers(answers: Record<string, string | number | boolean | null>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value == null) continue;
    const text = sanitizeWritten(String(value));
    if (text) out[key] = text;
  }
  return out;
}

function displayName(firstName: string, lastName = '') {
  const first = firstName.trim();
  const last = lastName.trim();
  const initial = last ? ` ${last[0]!.toUpperCase()}.` : '';
  return `${first}${initial}`.trim();
}

export async function submitAttempt(id: string, identity: Identity, body: SubmitAttemptBody) {
  if (body.companyWebsite) {
    throw badRequest('INVALID_SUBMISSION', 'Please try again.');
  }
  const attempt = await findAttempt(id, identity);
  if (attempt.submitted && attempt.finalScore != null) {
    return serializeResult(attempt);
  }
  const answers = { ...asRecord(attempt.answers), ...normalizeAnswers(body.answers) };
  const scored = scoreAttempt(answers);
  const name = displayName(body.firstName, body.lastName);
  let credentialId: string | null = null;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        answers: answers as Prisma.InputJsonValue,
        submitted: true,
        submittedAt: new Date(),
        finalScore: scored.finalScore,
        passed: scored.passed,
        categoryScores: scored.categoryScores as Prisma.InputJsonValue,
        firstName: body.firstName.trim(),
        email: body.email.trim().toLowerCase(),
        usBased: body.usBased,
        situation: body.situation,
        state: body.state?.toUpperCase() || null,
        shareScore: body.shareScore,
        userId: identity.userId ?? attempt.userId,
        visitorId: identity.visitorId ?? attempt.visitorId,
      },
      include: { certificate: true },
    });
    if (scored.passed && !next.certificate) {
      for (let i = 0; i < 6; i += 1) {
        credentialId = newCredentialId();
        try {
          await tx.courseCertificate.create({
            data: {
              credentialId,
              attemptId: next.id,
              userId: next.userId,
              visitorId: next.visitorId,
              courseSlug: next.courseSlug,
              learnerDisplayName: name,
              learnerLastInitial: body.lastName.trim()[0]?.toUpperCase() ?? '',
              score: scored.finalScore,
              shareScore: body.shareScore,
            },
          });
          break;
        } catch {
          credentialId = null;
        }
      }
    }
    return tx.assessmentAttempt.findUniqueOrThrow({ where: { id: next.id }, include: { certificate: true } });
  });
  return serializeResult(updated);
}

function categoryView(scores: Record<string, number> | null) {
  const keys: ScoreCategory[] = [
    'instruction_following',
    'response_evaluation',
    'factuality',
    'written_reasoning',
    'attention_to_detail',
  ];
  const record = (scores ?? {}) as Record<ScoreCategory, number>;
  return keys.map((key) => ({
    key,
    label: categoryLabel(key),
    score: record[key] ?? 0,
    band: bandForCategory(record[key] ?? 0),
    insight: insightForCategory(key, record[key] ?? 0),
  }));
}

function serializeResult(attempt: {
  id: string;
  submitted: boolean;
  finalScore: number | null;
  passed: boolean;
  categoryScores: Prisma.JsonValue | null;
  usBased: boolean | null;
  certificate: { credentialId: string; learnerDisplayName: string; issuedAt: Date; shareScore: boolean } | null;
}) {
  if (!attempt.submitted || attempt.finalScore == null) {
    throw badRequest('NOT_SUBMITTED', 'Submit the assessment to see your score.');
  }
  const scores = (attempt.categoryScores ?? {}) as Record<ScoreCategory, number>;
  const categories = categoryView(scores);
  const strongest = [...categories].sort((a, b) => b.score - a.score)[0];
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  const level = levelForScore(attempt.finalScore);
  return {
    attemptId: attempt.id,
    submitted: true,
    finalScore: attempt.finalScore,
    passed: attempt.passed,
    passScore: PASS_SCORE,
    level,
    levelCopy: LEVEL_COPY[level as ScoreLevel],
    categories,
    strongest: strongest ? { label: strongest.label, score: strongest.score } : null,
    opportunity: weakest ? { label: weakest.label, score: weakest.score } : null,
    recommendations: recommendationsFor(scores),
    usBased: attempt.usBased,
    certificate: attempt.certificate
      ? {
          credentialId: attempt.certificate.credentialId,
          issuedAt: attempt.certificate.issuedAt.toISOString(),
          learnerDisplayName: attempt.certificate.learnerDisplayName,
        }
      : null,
  };
}

export async function getAttemptResult(id: string, identity: Identity) {
  const attempt = await findAttempt(id, identity);
  if (!attempt.submitted) {
    return { attemptId: attempt.id, submitted: false, answers: attempt.answers, questions: publicQuestions() };
  }
  return serializeResult(attempt);
}

export async function getPublicCertificate(credentialId: string) {
  const certificate = await prisma.courseCertificate.findUnique({
    where: { credentialId: credentialId.trim() },
  });
  if (!certificate || certificate.status !== 'valid') {
    throw notFound('CREDENTIAL_NOT_FOUND', 'This credential could not be verified.');
  }
  return {
    credentialId: certificate.credentialId,
    course: 'AI Training Foundations',
    issuedTo: certificate.learnerDisplayName,
    issuedAt: certificate.issuedAt.toISOString(),
    status: 'Valid',
    assessment: 'Passed',
    score: certificate.shareScore ? certificate.score : null,
    verifyPath: `/certificate/${certificate.credentialId}`,
  };
}

export async function getCertificatePdf(credentialId: string) {
  const certificate = await prisma.courseCertificate.findUnique({
    where: { credentialId: credentialId.trim() },
  });
  if (!certificate || certificate.status !== 'valid') {
    throw notFound('CREDENTIAL_NOT_FOUND', 'This credential could not be verified.');
  }
  const pdf = await buildCertificatePdf({
    learnerName: certificate.learnerDisplayName,
    score: certificate.score,
    credentialId: certificate.credentialId,
    issuedAt: certificate.issuedAt,
    shareScore: certificate.shareScore,
  });
  return { pdf, filename: `${certificate.credentialId}.pdf` };
}
