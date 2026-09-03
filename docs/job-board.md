# Job board aggregation

AITrainers.coach collects **public employer job postings** related to AI training, evaluation, annotation, RLHF, and domain-expert work. The site is not the employer. Applications always happen on the original apply URL.

The job board shows **real employer postings** collected from public career pages and marketplace catalogs (micro1, Mercor). Hand-written placeholder listings have been removed. Aggregated jobs live in `JobSource` / `Job`.

## Architecture

```
JobSource registry
  → source adapter (greenhouse | lever | ashby | jsonld | custom)
  → normalize
  → relevance score + category
  → fingerprint / dedupe
  → upsert Job
  → mark stale jobs inactive
  → public /v1/jobs + /opportunities
```

Crawling never runs inside a normal page request. The public board reads only from PostgreSQL.

## Database

- `JobSource` — employer feed configuration
- `Job` — normalized posting (`sourceId` + `externalJobId` unique)
- `JobSyncRun` — per-source crawl log
- `JobSyncLock` — row used to prevent overlapping crawls

Public listings require `isActive`, not `isDuplicate`, and `relevanceScore >= 40`.

## Adapters

Each adapter implements:

```ts
interface JobSourceAdapter {
  fetchJobs(source): Promise<RawJob[]>
  normalize(rawJob, source): NormalizedJob | null
}
```

| Type | Identifier | Endpoint |
| --- | --- | --- |
| `greenhouse` | Board token | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| `lever` | Site slug | `https://api.lever.co/v0/postings/{site}?mode=json` |
| `ashby` | Board name | `https://api.ashbyhq.com/posting-api/job-board/{boardName}?includeCompensation=true` |
| `jsonld` | Careers URL | Fetches HTML and reads `JobPosting` JSON-LD. Honors robots.txt. |
| `custom` | Adapter key `micro1` or `mercor` | Public marketplace catalogs (micro1 sitemap + posting JSON-LD; Mercor `/explore` HTML). Honors robots.txt. |

Do not invent board IDs. Add a source only when you have the real public identifier.

Snorkel Greenhouse (`snorkelai`) and Mercor Ashby (`mercor`) are staff career boards and are skipped. DataAnnotation has no public per-role job feed yet.

### Add a Greenhouse source

Admin → Job sources, or:

```bash
curl -X POST https://api.aitrainers.coach/v1/admin/job-sources \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "companyName": "Example Labs",
    "companySlug": "example-labs",
    "sourceType": "greenhouse",
    "boardToken": "REAL_BOARD_TOKEN",
    "careersUrl": "https://boards.greenhouse.io/REAL_BOARD_TOKEN",
    "enabled": true
  }'
```

Lever uses `sourceType: "lever"` and the `{site}` from `jobs.lever.co/{site}`.

Ashby uses `sourceType: "ashby"` and the `{boardName}` from `jobs.ashbyhq.com/{boardName}`.

JSON-LD uses `sourceType: "jsonld"`, an empty `boardToken`, and `careersUrl` pointing at the public jobs page.

## Relevance

Keyword weights live in `src/modules/job-collector/relevance-weights.ts`.

- Score `>= 40`: public
- `20–39`: stored for review, not public
- `< 20` with no signal: rejected; tiny leftover scores are stored but hidden

Generic software-engineering titles are penalized unless the title also contains an AI-training override such as “Coding Expert – AI Training”.

`relevance_score` answers “is this appropriate for AITrainers.coach?”. When a signed-in user has a complete profile, `/v1/jobs` also returns a personalized `match` score per listing (domain, skills, experience, location, availability).

## Dedup and stale jobs

Fingerprint = SHA-256 of normalized company + title + location.

If the same fingerprint appears from more than one source, Greenhouse/Lever/Ashby copies win over JSON-LD/custom.

Jobs are never hard-deleted. After a successful source sync, if an active job has not been seen for 24 hours, `is_active` is set to `false`.

## Scheduling

The Fastify process runs a scheduler every `JOB_SYNC_INTERVAL_MINUTES` (default 360 = 6 hours) when `JOB_SYNC_ENABLED` is not `false`.

Each source also has `crawlFrequencyMinutes`. A global `JobSyncLock` row prevents overlapping runs.

Manual crawl:

```bash
cd aitraining.coach_backend
npm run jobs:discover
npm run jobs:sync
```

`jobs:discover` ensures micro1/Mercor marketplace sources, closes any legacy hand-written opportunity records, and (when `SERPER_API_KEY` is set) searches Google for Greenhouse/Lever/Ashby boards. Admin: Job sources → Search Google for boards.

Cron / GitHub Action against the API:

```bash
curl -X POST https://api.aitrainers.coach/v1/internal/jobs/sync \
  -H "Authorization: Bearer $JOB_SYNC_SECRET"
```

Admin UI: Job sources → Sync now.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `JOB_SYNC_SECRET` | Production recommended | Bearer secret for `/v1/internal/jobs/sync`. Falls back to `ADMIN_API_KEY` if unset. Never send this to the browser. |
| `JOB_SYNC_ENABLED` | No | Default on except during tests. Set `false` to disable the in-process scheduler. |
| `JOB_SYNC_INTERVAL_MINUTES` | No | Default `360`. |
| `SERPER_API_KEY` | For discovery | Google search via [Serper](https://serper.dev). Never send this to the browser. |
| `BOOKING_API_ORIGIN` | Dashboard SSR | Used by `/opportunities` and the sitemap to reach the API. Local default `http://127.0.0.1:4000`. |
| `SITE_ORIGIN` | Dashboard SEO | Canonical/sitemap origin. Default `https://aitrainers.coach`. |

## Public routes

- `GET /v1/jobs` — paginated public listings (no descriptions)
- `GET /v1/jobs/:slug` — public job detail
- `GET /v1/jobs/sitemap` — active public slugs
- Site: `/opportunities`, `/opportunities/[slug]`

## Admin routes

All require the existing admin session cookie or `Authorization: Bearer $ADMIN_API_KEY`.

- `GET/POST /v1/admin/job-sources`
- `PATCH /v1/admin/job-sources/:id`
- `POST /v1/admin/job-sources/:id/sync`
- `GET /v1/admin/jobs`
- `PATCH /v1/admin/jobs/:id` `{ "isActive": false }`

## Security

Crawled HTML is sanitized before storage/render. Fetching is limited to public http(s) hosts (no localhost, RFC1918, link-local, or cloud metadata). JSON-LD adapters honor robots.txt. User-Agent: `AITrainersCoachJobBot/1.0 (+https://aitrainers.coach)`.
