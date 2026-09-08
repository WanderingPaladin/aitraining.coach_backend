import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { isUuid } from '../tracking/sanitize.js';
import { COURSE_SLUG, PASS_SCORE, questionsForIds, selectAttemptQuestionIds } from './questions.js';
import { encodeQuestionSet, mergeAnswers, publicAnswers, readCurrentIndex, readQuestionSet } from './attempt-meta.js';
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

function learnLog(operation: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production' && process.env.LEARN_ASSESSMENT_DEBUG !== 'true') {
    return;
  }
  console.info(`[Assessment:${operation}]`, payload);
}

function uniqueSorted(values: number[] | undefined) {
  return [...new Set((values ?? []).filter((value) => value >= 1 && value <= 8))].sort((a, b) => a - b);
}

function uniqueLabs(values: string[] | undefined) {
  return [...new Set((values ?? []).map((item) => item.trim()).filter(Boolean))];
}

const LAB_PREFIX = 'lab:';

function extractCompletedLabs(quizResults: Prisma.JsonValue | null | undefined) {
  if (!quizResults || typeof quizResults !== 'object' || Array.isArray(quizResults)) return [];
  return uniqueLabs(
    Object.entries(quizResults as Record<string, unknown>)
      .filter(([key, value]) => key.startsWith(LAB_PREFIX) && (value === true || value === 'true' || value === 1))
      .map(([key]) => key.slice(LAB_PREFIX.length)),
  );
}

function quizResultsWithLabs(quizResults: Prisma.JsonValue | null | undefined, labs: string[]) {
  const base =
    quizResults && typeof quizResults === 'object' && !Array.isArray(quizResults)
      ? Object.fromEntries(
          Object.entries(quizResults as Record<string, unknown>).filter(([key]) => !key.startsWith(LAB_PREFIX)),
        )
      : {};
  for (const slug of labs) base[`${LAB_PREFIX}${slug}`] = true;
  return base;
}

function serializeOpenAttempt(attempt: { id: string; answers: Prisma.JsonValue }) {
  return {
    id: attempt.id,
    submitted: false as const,
    answers: publicAnswers(attempt.answers),
    currentIndex: readCurrentIndex(attempt.answers),
  };
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
  const completed = uniqueSorted(row.completedModules);
  const completedLabs = extractCompletedLabs(row.quizResults);
  const percent = Math.min(100, Math.max(0, Math.round((completed.length / 8) * 100) || 0));
  return {
    courseSlug: COURSE_SLUG,
    currentModule: row.currentModule,
    completedModules: completed,
    startedModules: row.startedModules,
    completedLabs,
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
      completedLabs: [] as string[],
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
  const completedLabs = uniqueLabs([
    ...extractCompletedLabs(existing?.quizResults),
    ...extractCompletedLabs(body.quizResults),
    ...(body.completedLabs ?? []),
  ]);
  const data = {
    userId: identity.userId,
    visitorId,
    courseSlug: body.courseSlug,
    currentModule: body.currentModule ?? existing?.currentModule ?? 1,
    completedModules,
    startedModules,
    quizResults: quizResultsWithLabs(body.quizResults ?? existing?.quizResults, completedLabs) as Prisma.InputJsonValue,
    lastLesson: body.lastLesson ?? existing?.lastLesson ?? null,
    completedAt:
      completedModules.length >= 8 || body.completedAt
        ? (existing?.completedAt ?? new Date())
        : (existing?.completedAt ?? null),
  };
  const row = existing
    ? await prisma.courseProgress.update({ where: { id: existing.id }, data })
    : await prisma.courseProgress.create({ data });
  learnLog('progress', { completedModules: completedModules.length, completedLabs: completedLabs.length });
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

function questionsForAttempt(attempt: { answers: Prisma.JsonValue }) {
  const stored = readQuestionSet(attempt.answers);
  if (stored.length) return questionsForIds(stored);
  const answered = Object.keys(publicAnswers(attempt.answers));
  if (answered.length) return questionsForIds(answered);
  return questionsForIds(selectAttemptQuestionIds());
}

function questionIdsFor(attempt: { answers: Prisma.JsonValue }) {
  const stored = readQuestionSet(attempt.answers);
  if (stored.length) return stored;
  return questionsForAttempt(attempt).map((item) => item.id);
}

function allowedAttempt(
  attempt: { userId: string | null; visitorId: string | null },
  identity: Identity,
  visitorId: string | null,
) {
  return Boolean(
    (identity.userId && attempt.userId === identity.userId) ||
      (visitorId && attempt.visitorId === visitorId),
  );
}

export async function startAttempt(identity: Identity, body: StartAttemptBody) {
  const visitorId = await ensureVisitor(identity.visitorId, identity.userId);
  if (!identity.userId && !visitorId) {
    throw badRequest('IDENTITY_REQUIRED', 'A visitor or account is required to start the assessment.');
  }

  if (body.attemptId) {
    const existing = await prisma.assessmentAttempt.findUnique({
      where: { id: body.attemptId },
      include: { certificate: true },
    });
    if (existing && allowedAttempt(existing, identity, visitorId)) {
      if (existing.submitted) {
        if (!body.retake) {
          learnLog('start', { attemptId: existing.id, submitted: true, resumed: true });
          return {
            attempt: { id: existing.id, submitted: true, answers: {} },
            questions: [],
            result: serializeResult(existing),
          };
        }
      } else {
        learnLog('start', {
          attemptId: existing.id,
          submitted: false,
          resumed: true,
          currentQuestion: readCurrentIndex(existing.answers),
          answerCount: Object.keys(publicAnswers(existing.answers)).length,
        });
        return {
          attempt: serializeOpenAttempt(existing),
          questions: questionsForAttempt(existing),
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
    include: { certificate: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (open) {
    learnLog('start', {
      attemptId: open.id,
      submitted: false,
      resumed: true,
      currentQuestion: readCurrentIndex(open.answers),
      answerCount: Object.keys(publicAnswers(open.answers)).length,
    });
    return {
      attempt: serializeOpenAttempt(open),
      questions: questionsForAttempt(open),
    };
  }

  if (!body.retake) {
    const latest = await prisma.assessmentAttempt.findFirst({
      where: {
        courseSlug: body.courseSlug,
        submitted: true,
        OR: [
          ...(identity.userId ? [{ userId: identity.userId }] : []),
          ...(visitorId ? [{ visitorId }] : []),
        ],
      },
      include: { certificate: true },
      orderBy: { submittedAt: 'desc' },
    });
    if (latest && latest.finalScore != null) {
      learnLog('start', { attemptId: latest.id, submitted: true, resumed: true });
      return {
        attempt: { id: latest.id, submitted: true, answers: {} },
        questions: [],
        result: serializeResult(latest),
      };
    }
  }

  const questionSet = selectAttemptQuestionIds();
  const created = await prisma.assessmentAttempt.create({
    data: {
      userId: identity.userId,
      visitorId,
      courseSlug: body.courseSlug,
      answers: encodeQuestionSet(questionSet) as Prisma.InputJsonValue,
    },
  });
  learnLog('start', { attemptId: created.id, submitted: false, resumed: false, questionCount: questionSet.length });
  return {
    attempt: { id: created.id, submitted: false, answers: {}, currentIndex: 0 },
    questions: questionsForIds(questionSet),
  };
}

export async function saveAnswers(id: string, identity: Identity, body: SaveAnswersBody) {
  const attempt = await findAttempt(id, identity);
  if (attempt.submitted) {
    throw conflict('ALREADY_SUBMITTED', 'Your assessment has already been submitted.');
  }
  const questionIds = questionIdsFor(attempt);
  const merged = mergeAnswers(attempt.answers, normalizeAnswers(body.answers), questionIds, body.currentIndex);
  const updated = await prisma.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { answers: merged as Prisma.InputJsonValue, visitorId: identity.visitorId ?? attempt.visitorId },
  });
  learnLog('answer', {
    attemptId: updated.id,
    answered: Object.keys(publicAnswers(updated.answers)).length,
    currentIndex: readCurrentIndex(updated.answers),
    success: true,
  });
  return {
    id: updated.id,
    answers: publicAnswers(updated.answers),
    currentIndex: readCurrentIndex(updated.answers),
  };
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
    learnLog('submit', { attemptId: attempt.id, submitted: true, replay: true });
    return serializeResult(attempt);
  }
  const questionIds = questionIdsFor(attempt);
  const answers = mergeAnswers(attempt.answers, normalizeAnswers(body.answers), questionIds);
  const scored = scoreAttempt(publicAnswers(answers), questionIds);
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
  learnLog('submit', {
    attemptId: updated.id,
    submitted: true,
    passed: updated.passed,
    hasCertificate: Boolean(updated.certificate),
  });
  return serializeResult(updated);
}

export async function retryCertificate(id: string, identity: Identity) {
  const attempt = await findAttempt(id, identity);
  if (!attempt.submitted || attempt.finalScore == null) {
    throw badRequest('NOT_SUBMITTED', 'Submit the assessment to see your score.');
  }
  if (!attempt.passed) {
    throw badRequest('NOT_ELIGIBLE', 'A certificate is available after a passing assessment.');
  }
  if (attempt.certificate) {
    learnLog('certificate', { attemptId: attempt.id, replay: true });
    return serializeResult(attempt);
  }
  const name = (attempt.firstName ?? 'Learner').trim() || 'Learner';
  for (let i = 0; i < 6; i += 1) {
    const credentialId = newCredentialId();
    try {
      await prisma.courseCertificate.create({
        data: {
          credentialId,
          attemptId: attempt.id,
          userId: attempt.userId,
          visitorId: attempt.visitorId,
          courseSlug: attempt.courseSlug,
          learnerDisplayName: name,
          score: attempt.finalScore,
          shareScore: attempt.shareScore,
        },
      });
      break;
    } catch {
      // unique credential collision; retry
    }
  }
  const next = await prisma.assessmentAttempt.findUniqueOrThrow({
    where: { id: attempt.id },
    include: { certificate: true },
  });
  learnLog('certificate', { attemptId: next.id, hasCertificate: Boolean(next.certificate) });
  return serializeResult(next);
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
    certificatePending: attempt.passed && !attempt.certificate,
  };
}

export async function getAttemptResult(id: string, identity: Identity) {
  const attempt = await findAttempt(id, identity);
  if (!attempt.submitted) {
    return {
      attemptId: attempt.id,
      submitted: false,
      answers: publicAnswers(attempt.answers),
      questions: questionsForAttempt(attempt),
      currentIndex: readCurrentIndex(attempt.answers),
    };
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
