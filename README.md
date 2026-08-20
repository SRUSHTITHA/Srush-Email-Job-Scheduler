# Postbox Scheduler

Postbox Scheduler is a TypeScript email scheduling application with an Express API, PostgreSQL persistence, Redis/BullMQ background processing, Ethereal SMTP test delivery, and a React dashboard.

## Architecture overview

```text
React/Vite web app
   |
   | HTTP + cookie authentication
   v
Express API ---- Prisma ---- PostgreSQL
   |
   | deterministic delayed BullMQ jobs
   v
Redis queue <---- BullMQ worker ---- Ethereal SMTP test inbox
```

- The frontend calls the authenticated Express API to create campaigns and read scheduled or completed messages.
- PostgreSQL stores users, campaigns, recipients, message status, schedule times, attachments, and idempotency keys.
- Redis stores BullMQ delayed jobs and the atomic rate-limit state used by the worker.
- The worker is a separate long-running process. It reads message records, applies provider limits, sends through Ethereal, and updates each message to `SENT` or `FAILED`.

## Features implemented

### Backend

- **Scheduler:** Creates one message per unique recipient and calculates `startAt + (recipient position x delaySeconds)` to preserve campaign order.
- **Persistence:** Prisma/PostgreSQL stores campaign and message state. Deterministic BullMQ job IDs prevent duplicate queue entries.
- **Restart recovery:** On worker startup, scheduled messages are reconciled back into BullMQ. Stale `PROCESSING` messages older than `PROCESSING_LEASE_SECONDS` are returned to `SCHEDULED` and re-enqueued.
- **Rate limiting:** An atomic Redis Lua operation enforces both a per-user minimum gap and a per-user UTC hourly limit. A message is delayed to the next available slot or hour instead of being dropped.
- **Concurrency:** BullMQ `WORKER_CONCURRENCY` controls parallel processing. A conditional database claim changes `SCHEDULED` to `PROCESSING`, so multiple workers cannot claim the same message.
- **Retry safety:** Infrastructure failures before SMTP return a message to `SCHEDULED` for BullMQ retry; failures after SMTP is attempted become `FAILED` to avoid unsafe duplicate sends.
- **Authentication:** Email/password registration and login plus Google OAuth, protected by an HTTP-only cookie session.
- **Idempotency:** `Idempotency-Key` is supported for campaign creation and PostgreSQL uniqueness prevents repeated submissions from creating duplicate campaigns.

### Frontend

- Email/password login and registration, with Google login.
- Authenticated dashboard with the current user profile and logout.
- Scheduled and sent message views with loading, empty, error, retry, and refresh states.
- Compose screen with recipient entry, duplicate removal, pasted addresses, and CSV/text recipient-list upload.
- Subject and message editor with optional file attachment.
- Send-later presets and custom future date/time selection.
- Campaign controls for delay between messages and hourly limit.

## How scheduling works

1. The compose form sends recipients, message content, attachment data, `startAt`, `delaySeconds`, and `hourlyLimit` to `POST /api/campaigns`.
2. The API validates and normalizes the input, removes duplicate email addresses, creates the campaign and all `SCHEDULED` message rows in PostgreSQL, then enqueues one delayed BullMQ job per message.
3. Each job has a deterministic ID based on its database message ID. Its initial delay is calculated from that message's `scheduledFor` timestamp.
4. When the worker wakes a job, it atomically reserves a provider slot in Redis. If the minimum gap or hourly limit requires waiting, the same job is moved back to a future delayed time.
5. The worker claims the database row, sends the message using one of the configured Ethereal test accounts, logs the Ethereal preview URL, and records `SENT`.

The normal path is designed to avoid duplicate sends, but SMTP cannot provide absolute exactly-once delivery if the process dies after the provider accepts a message and before PostgreSQL records `SENT`. That uncertainty is recorded for reconciliation rather than automatically sending again.

## Environment variables

Copy the root `.env.example` to `.env` before starting the API or worker:

```powershell
Copy-Item .env.example .env
```

Required local infrastructure settings:

```env
DATABASE_URL="postgresql://postbox:postbox@localhost:5432/postbox?schema=public"
REDIS_URL="redis://localhost:6379"
API_PORT=4000
WEB_ORIGIN="http://localhost:5173"
VITE_API_URL="http://localhost:4000"
JWT_SECRET="replace-this-with-a-long-random-value"
```

Worker settings:

```env
WORKER_CONCURRENCY=4
MIN_SEND_GAP_SECONDS=2
DEFAULT_HOURLY_LIMIT=100
ETHEREAL_SENDER_COUNT=2
PROCESSING_LEASE_SECONDS=900
JOB_ATTEMPTS=3
JOB_BACKOFF_MS=10000
```

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` are only needed when Google login is enabled. In production, `JWT_SECRET` must be at least 32 characters.

## Ethereal Email setup

No Ethereal account credentials are required in `.env`. When the worker starts, Nodemailer calls `createTestAccount()` and creates `ETHEREAL_SENDER_COUNT` temporary Ethereal sender accounts automatically. Each successful send prints a preview URL in the worker terminal, for example:

```text
Sent <message-id>: https://ethereal.email/message/...
```

Open that URL to inspect the test email. Ethereal does not deliver to real recipients, so configure a real SMTP provider in `apps/api/src/worker/email-worker.ts` before production use. `ETHEREAL_SENDER_COUNT` controls how many test accounts are created and selected deterministically across messages.

## Local setup

1. Install these on your computer:
   - Node.js 20 or newer: https://nodejs.org
   - Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Open PowerShell in this folder.
3. Copy `.env.example` to `.env` and change `JWT_SECRET` to a long random phrase.
4. Start PostgreSQL and Redis:

   ```powershell
   docker compose up -d
   ```

5. Install JavaScript packages:

   ```powershell
   npm install
   ```

6. Create the database tables:

   ```powershell
   npm run db:generate
   npm run db:migrate -- --name initial
   ```

7. Start the backend API in one PowerShell window:

   ```powershell
   npm run dev:api
   ```

   The API listens on `http://localhost:4000`. Check `http://localhost:4000/health` for `{"ok":true}`.

8. Start the BullMQ worker in a second PowerShell window:

   ```powershell
   npm run dev:worker
   ```

   The worker connects to PostgreSQL and Redis, reconciles pending messages, and creates the Ethereal test senders.

9. Start the frontend in a third PowerShell window:

   ```powershell
   npm run dev:web
   ```

10. Open `http://localhost:5173`, sign in, upload a small `.csv` or `.txt` list, select a future time, and schedule the campaign.

### Backend commands

```powershell
npm run dev:api       # Express API with tsx watch
npm run dev:worker   # BullMQ worker with tsx watch
npm run db:generate   # Generate Prisma Client
npm run db:migrate -- --name initial
```

### Frontend commands

```powershell
npm run dev:web
```

The frontend uses `VITE_API_URL` and defaults to `http://localhost:4000`.

