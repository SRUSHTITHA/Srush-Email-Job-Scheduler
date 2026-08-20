# Postbox Scheduler

An original implementation of the email-scheduler assignment: a TypeScript Express API, PostgreSQL, Redis/BullMQ worker, Ethereal SMTP test sender, and a React dashboard styled from the provided references.

## What is already in this project

- Google OAuth routes and protected dashboard API routes.
- PostgreSQL/Prisma models for users, campaigns, and individual email messages.
- BullMQ delayed jobs with stable database-derived job IDs.
- A configurable BullMQ worker and Ethereal test sender.
- CSV/text lead parsing in the browser.
- A dashboard with login, scheduled/sent views, loading/empty states, and compose form.
- Redis-backed per-user hourly counters. When the limit is reached, the worker moves the job into the next hour instead of dropping it.

## How the limits work

Each email is initially given a timestamp based on `startAt + (recipient position × delaySeconds)`. This preserves list order even if several workers run at once. The worker also keeps a Redis `next-slot` key as a shared final safeguard for the per-email delay. The hourly count uses a Redis counter keyed by user and UTC hour; Redis makes this work across processes and server instances.

The environment variables `WORKER_CONCURRENCY`, `MIN_SEND_GAP_SECONDS`, and `DEFAULT_HOURLY_LIMIT` make sending policy configurable. The compose form currently accepts the campaign-specific delay and hourly limit. The API rejects a delay below the server’s minimum.

## Beginner-friendly local setup

1. Install these on your computer:
   - Node.js 20 or newer: https://nodejs.org
   - Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Open PowerShell in this folder.
3. Copy `.env.example` to `.env` and change `JWT_SECRET` to a long random phrase.
4. Start the database and Redis:

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

7. Configure Google OAuth (the next section), then run these in three separate PowerShell windows:

   ```powershell
   npm run dev:api
   npm run dev:worker
   npm run dev:web
   ```

8. Open `http://localhost:5173`, sign in, upload a small `.csv` or `.txt` list, select a future time, and schedule the campaign.

## Google OAuth setup

1. In Google Cloud Console, create a project and configure the OAuth consent screen as **External** (add yourself as a test user).
2. Create an **OAuth client ID** of type **Web application**.
3. Add `http://localhost:4000/auth/google/callback` as an authorized redirect URI.
4. Copy its client ID and client secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Restart the API after editing `.env`.

## Testing restarts

Schedule an email a few minutes ahead, stop the API and worker, then start them again. The message row remains in PostgreSQL and the BullMQ delayed job remains in Redis. It will therefore send at its scheduled time once the worker is running again.

## Design note on email idempotency

The worker claims a `SCHEDULED` row with a conditional database update before SMTP is called, which prevents two workers from sending the same message. Its BullMQ job ID is also deterministic. SMTP itself cannot prove absolute exactly-once delivery if a machine dies after the remote SMTP provider accepts the email but before the database records `SENT`; this project intentionally avoids automatic retries for that uncertain case to favour avoiding duplicate sends. In a production system, that case would be surfaced for manual reconciliation or handled through a provider-specific idempotency mechanism.
