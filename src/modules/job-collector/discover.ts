import type { JobSourceType } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db/prisma.js';
import { badRequest } from '../../lib/errors.js';
import { parseAtsUrl, type DiscoveredBoard } from './ats-url.js';
import { delay, SafeFetchError, safeFetchJson } from './http.js';
import { ensureMarketplaceSources, MARKETPLACE_SOURCES } from './marketplace-sources.js';
import { slugify } from './text.js';
import type { SyncLogger } from './types.js';
import { ensureCuratedOpportunities } from '../opportunities/ensure-seed.js';

export type { DiscoveredBoard };
export { parseAtsUrl };

export type DiscoverResult = {
  queries: number;
  urlsSeen: number;
  boardsFound: number;
  sourcesCreated: number;
  sourcesUpdated: number;
  sourcesSkipped: number;
  seedOpportunitiesClosed: number;
  seedOpportunitiesReopened: number;
  boards: Array<{ sourceType: string; boardToken: string; companyName: string; created: boolean }>;
};

const SKIP_STAFF_BOARDS = new Set(['ashby:mercor', 'greenhouse:snorkelai']);

const DISCOVERY_QUERIES = [
  'site:boards.greenhouse.io "AI trainer"',
  'site:boards.greenhouse.io "AI evaluator"',
  'site:boards.greenhouse.io RLHF',
  'site:boards.greenhouse.io "data annotator"',
  'site:boards.greenhouse.io "LLM evaluator"',
  'site:job-boards.greenhouse.io "AI trainer"',
  'site:jobs.lever.co "AI trainer"',
  'site:jobs.lever.co RLHF',
  'site:jobs.lever.co "data annotation"',
  'site:jobs.ashbyhq.com "AI trainer"',
  'site:jobs.ashbyhq.com RLHF',
  'site:jobs.ashbyhq.com annotator',
];

type SerperOrganic = { link?: string; title?: string };
type SerperPayload = { organic?: SerperOrganic[] };
type GreenhouseBoard = { name?: string };
type GreenhouseJobs = { jobs?: unknown[] };
type LeverJobs = unknown[];
type AshbyBoard = { jobs?: unknown[] };

function titleFromToken(token: string): string {
  return token
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

async function serperSearch(query: string): Promise<string[]> {
  const key = config.SERPER_API_KEY.trim();
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (response.status === 401 || response.status === 403) {
    throw badRequest('SERPER_AUTH', 'Serper API key was rejected');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new SafeFetchError('HTTP_ERROR', `Serper responded with ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`, response.status);
  }
  const payload = (await response.json()) as SerperPayload;
  return (payload.organic ?? []).map((item) => item.link).filter((link): link is string => Boolean(link));
}

async function probeBoard(board: DiscoveredBoard): Promise<{ ok: boolean; companyName: string; jobCount: number }> {
  try {
    if (board.sourceType === 'greenhouse') {
      const meta = await safeFetchJson<GreenhouseBoard>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardToken)}`,
      );
      const jobs = await safeFetchJson<GreenhouseJobs>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardToken)}/jobs`,
      );
      const jobCount = Array.isArray(jobs.jobs) ? jobs.jobs.length : 0;
      return {
        ok: jobCount > 0,
        companyName: (meta.name || '').trim() || titleFromToken(board.boardToken),
        jobCount,
      };
    }
    if (board.sourceType === 'lever') {
      const jobs = await safeFetchJson<LeverJobs>(
        `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardToken)}?mode=json&limit=10`,
      );
      const jobCount = Array.isArray(jobs) ? jobs.length : 0;
      return { ok: jobCount > 0, companyName: titleFromToken(board.boardToken), jobCount };
    }
    const jobs = await safeFetchJson<AshbyBoard>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardToken)}`,
    );
    const jobCount = Array.isArray(jobs.jobs) ? jobs.jobs.length : 0;
    return { ok: jobCount > 0, companyName: titleFromToken(board.boardToken), jobCount };
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return { ok: false, companyName: titleFromToken(board.boardToken), jobCount: 0 };
    }
    throw error;
  }
}

async function uniqueCompanySlug(sourceType: JobSourceType, token: string): Promise<string> {
  const base = slugify(`${sourceType}-${token}`, 72);
  const existing = await prisma.jobSource.findUnique({
    where: { companySlug: base },
    select: { boardToken: true, sourceType: true },
  });
  if (!existing || (existing.boardToken === token && existing.sourceType === sourceType)) {
    return base;
  }
  return slugify(`${sourceType}-${token}-${Date.now().toString(36)}`, 80);
}

export async function discoverJobSources(logger: SyncLogger): Promise<DiscoverResult> {
  const seen = new Map<string, DiscoveredBoard>();
  let urlsSeen = 0;

  if (config.SERPER_API_KEY.trim()) {
    for (const query of DISCOVERY_QUERIES) {
      logger.info({ query }, 'searching for ATS boards');
      const links = await serperSearch(query);
      urlsSeen += links.length;
      for (const link of links) {
        const parsed = parseAtsUrl(link);
        if (!parsed) continue;
        const key = `${parsed.sourceType}:${parsed.boardToken}`;
        if (SKIP_STAFF_BOARDS.has(key)) {
          continue;
        }
        seen.set(key, parsed);
      }
      await delay(350);
    }
  } else {
    logger.warn({}, 'SERPER_API_KEY missing; skipping Google ATS discovery');
  }

  const boards = [...seen.values()];
  let sourcesCreated = 0;
  let sourcesUpdated = 0;
  let sourcesSkipped = 0;
  const saved: DiscoverResult['boards'] = [];

  for (const board of boards) {
    let probe: { ok: boolean; companyName: string; jobCount: number };
    try {
      probe = await probeBoard(board);
    } catch (error) {
      logger.warn({ err: error, board }, 'board probe failed');
      sourcesSkipped += 1;
      await delay(200);
      continue;
    }
    if (!probe.ok) {
      sourcesSkipped += 1;
      await delay(150);
      continue;
    }

    const existing = await prisma.jobSource.findFirst({
      where: { sourceType: board.sourceType, boardToken: board.boardToken },
    });
    if (existing) {
      await prisma.jobSource.update({
        where: { id: existing.id },
        data: {
          enabled: true,
          careersUrl: board.careersUrl,
          companyName: existing.companyName || probe.companyName,
        },
      });
      sourcesUpdated += 1;
      saved.push({
        sourceType: board.sourceType,
        boardToken: board.boardToken,
        companyName: existing.companyName || probe.companyName,
        created: false,
      });
    } else {
      const companySlug = await uniqueCompanySlug(board.sourceType, board.boardToken);
      await prisma.jobSource.create({
        data: {
          companyName: probe.companyName,
          companySlug,
          sourceType: board.sourceType,
          boardToken: board.boardToken,
          careersUrl: board.careersUrl,
          enabled: true,
          priority: 200,
          crawlFrequencyMinutes: 360,
        },
      });
      sourcesCreated += 1;
      saved.push({
        sourceType: board.sourceType,
        boardToken: board.boardToken,
        companyName: probe.companyName,
        created: true,
      });
    }
    await delay(150);
  }

  const marketplace = await ensureMarketplaceSources();
  sourcesCreated += marketplace.created;
  sourcesUpdated += marketplace.updated;
  for (const item of MARKETPLACE_SOURCES) {
    saved.push({
      sourceType: item.sourceType,
      boardToken: item.boardToken,
      companyName: item.companyName,
      created: marketplace.created > 0,
    });
  }
  const curated = await ensureCuratedOpportunities();
  logger.info(
    {
      boardsFound: boards.length,
      sourcesCreated,
      sourcesUpdated,
      marketplace,
      curated,
    },
    'job board discovery finished',
  );

  return {
    queries: DISCOVERY_QUERIES.length,
    urlsSeen,
    boardsFound: boards.length,
    sourcesCreated,
    sourcesUpdated,
    sourcesSkipped,
    seedOpportunitiesClosed: 0,
    seedOpportunitiesReopened: curated.reopened + curated.created,
    boards: saved,
  };
}
