# aitraining.coach backend

API for AI Trainers applications and intro-call booking. The marketing site posts applications and books intro calls against this service.

## Stack

- Fastify 5 + TypeScript
- Prisma + PostgreSQL
- Zod validation
- Custom availability windows (no Calendly)

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

The API listens on `http://127.0.0.1:5000`. Seeded availability is **Monday–Friday, 09:00–17:00 America/New_York**, 30-minute intro calls.

Intro calls use `https://meet.google.com/yyx-ptbr-wfo`. Booking copies go to `rileybabcock0@gmail.com`.

The marketing site on port 3000 proxies `/v1` to this API on port 5000, so the browser only talks to the site origin.

## Email (Resend)

Put `RESEND_API_KEY` in `.env` (never commit it). You do **not** need to share the Resend login email — the API key is enough to send.

`MAIL_FROM` must use a domain you have **verified in Resend**:

1. In [Resend → Domains](https://resend.com/domains), add `aitrainers.coach`.
2. Copy the DNS records Resend shows (DKIM, and SPF/DMARC if asked) into your domain DNS.
3. Wait until sending is verified (receiving MX is optional).
4. Keep `MAIL_FROM=AI Trainers <hello@aitrainers.coach>` (or another mailbox on that domain).

Until sending is verified, Resend will reject mail from `hello@aitrainers.coach`, and the test domain can only deliver to the email you used to sign up. Candidate applications will not receive mail until verification is done.

Without `RESEND_API_KEY`, messages are logged to the console instead.

## Candidate flow

### 1. Apply

```bash
curl -sS -X POST http://127.0.0.1:5000/v1/applications \
  -H 'content-type: application/json' \
  -d '{
    "firstName": "Priya",
    "lastName": "Shah",
    "email": "priya@example.com",
    "phone": "+15125550100",
    "city": "Austin",
    "state": "TX",
    "profession": "Software",
    "yearsOfExperience": 2,
    "timezone": "America/Chicago",
    "ipAddress": "203.0.113.10",
    "ipLocation": "Austin, Texas, United States"
  }'
```

Submitting again with the same email while status is `submitted` updates the existing application.

### 2. List open slots

```bash
curl -sS 'http://127.0.0.1:5000/v1/slots?timezone=Asia/Kolkata'
```

Optional `from` and `to` query params are ISO datetimes. The range cannot exceed 31 days (default is 14).

### 3. Book an intro call

Use `application.id` from step 1 and `slots[0].startsAt` from step 2:

```bash
curl -sS -X POST http://127.0.0.1:5000/v1/bookings \
  -H 'content-type: application/json' \
  -d '{
    "applicationId": "APPLICATION_ID",
    "startsAt": "SLOT_STARTS_AT"
  }'
```

A 409 means the slot was taken. The response includes `cancelToken`.

### 4. Cancel

```bash
curl -sS -X POST http://127.0.0.1:5000/v1/bookings/BOOKING_ID/cancel \
  -H 'content-type: application/json' \
  -d '{"token":"CANCEL_TOKEN"}'
```

## Admin API

All admin routes require `Authorization: Bearer $ADMIN_API_KEY`.

```bash
export ADMIN_API_KEY=change-me-admin-key

curl -sS http://127.0.0.1:5000/v1/admin/applications \
  -H "Authorization: Bearer $ADMIN_API_KEY"

curl -sS -X PATCH http://127.0.0.1:5000/v1/admin/applications/APPLICATION_ID \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"status":"reviewed"}'

curl -sS http://127.0.0.1:5000/v1/admin/availability \
  -H "Authorization: Bearer $ADMIN_API_KEY"

curl -sS -X POST http://127.0.0.1:5000/v1/admin/availability \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "weekday": 1,
    "startTime": "09:00",
    "endTime": "17:00",
    "timezone": "America/New_York",
    "slotMinutes": 30,
    "bufferMinutes": 0
  }'

curl -sS http://127.0.0.1:5000/v1/admin/bookings \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

`weekday` is JS-style: `0` Sunday through `6` Saturday.

## Health

```bash
curl -sS http://127.0.0.1:5000/health
```

## Tests

```bash
npm test
```

## Job board

Aggregated AI-training opportunities are documented in [`docs/job-board.md`](docs/job-board.md). After deploying the `20260902190000_job_board` migration, add real Greenhouse/Lever/Ashby/JSON-LD identifiers in Admin → Job sources, then run:

```bash
npm run jobs:sync
```
