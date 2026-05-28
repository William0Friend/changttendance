# Setup Guide

## Step 1 — Instant deploy (in-person enrollment only)

```bash
npm install
npm run build
```

Drag the `dist/` folder to [Netlify Drop](https://app.netlify.com/drop). You get a live URL immediately. In-person enrollment works right away with no further configuration.

## Step 2 — Add Supabase for online enrollment queue

Create a free account at [supabase.com](https://supabase.com). Create a new project.

### SQL — paste into the Supabase SQL editor

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS enrollment_queue (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_name    text        NOT NULL,
  student_id      text,
  email           text,
  class_id        text        NOT NULL,
  photo_path      text        NOT NULL,
  consent_given   boolean     NOT NULL DEFAULT false,
  consent_text    text,
  photo_quality_score double precision,
  landmark_confidence double precision,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  status          text        NOT NULL DEFAULT 'pending',
  imported_at     timestamptz
);

ALTER TABLE enrollment_queue ENABLE ROW LEVEL SECURITY;

-- Students can insert (submit enrollment) but not read other students' records
CREATE POLICY "allow_insert" ON enrollment_queue
  FOR INSERT WITH CHECK (consent_given = true AND student_name <> '' AND class_id <> '');

-- No SELECT policy for anon users — professor uses service role or dashboard

CREATE INDEX IF NOT EXISTS idx_eq_class_pending ON enrollment_queue (class_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_eq_expires       ON enrollment_queue (expires_at) WHERE status = 'pending';
```

### Storage bucket

In the Supabase dashboard → Storage → New bucket:
- Name: `enrollment-photos`
- Public: **No** (private)
- File size limit: 5MB
- Allowed MIME types: `image/jpeg, image/png, image/webp`

## Step 3 — Add environment variables to Netlify

In Netlify → Site settings → Environment variables:

```
VITE_SUPABASE_URL      = https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ...
```

Trigger a redeploy after adding variables.

## Step 4 — Keep-alive GitHub Action

Add these as GitHub repository secrets (Settings → Secrets → Actions):

```
SUPABASE_URL      = https://your-project-id.supabase.co
SUPABASE_ANON_KEY = eyJ...
```

The workflow at `.github/workflows/keep-alive.yml` pings Supabase every 5 days to prevent the free tier from pausing (it pauses after 7 days of inactivity).

## Step 5 — Test the full flow

1. Open the app → Settings → enter Supabase credentials → Test Connection
2. Create a class → Classes tab → New Class
3. Copy the enrollment link or share the QR code with a student
4. Student visits the link, submits their name, ID, photo, and consent
5. Professor opens Enroll Students → Online Queue → Approve
6. Start a session → Take Attendance tab → Start Session

## Step 6 — Local development

```bash
npm run dev       # Vite dev server with COOP/COEP headers
npm run fetch-models # (optional) download face-api models into public/models for offline builds
npm run build     # Production build
npm run test:unit # Vitest unit tests
npm run lint      # ESLint
```

### Docker (local)

```bash
cp .env.example .env     # fill in Supabase credentials (if using Supabase)
docker compose up --build
```

Notes:

- docker compose will load `docker-compose.override.yml` which includes the local Node API server (`server`) and a `server-data` volume for photos.
- To use the local Postgres-backed provider (recommended for offline/local dev), set `VITE_USE_LOCAL_API=true` at build time or set `VITE_LOCAL_API_URL=/api` when building the web image. The included nginx proxy exposes the API under `/api` on the same host.
- Initialize DB (run once after compose up): use the VS Code task "Changttendance: DB Init" or run:

```bash
docker compose exec db psql -U chang -d changttendance -f /docker-entrypoint-initdb.d/init.sql
```

- The app will be available at http://localhost:8080. Student enrollment pages will post to `/api` endpoints on the same host.

- To run the Node API server locally without Docker (dev):

```bash
cd server
npm ci
npm run dev
```

Keep DB connection env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) pointing to your Postgres instance.

Run tests

- Unit tests (fast):

```bash
npm run test:unit
```

- End-to-end (Playwright):

```bash
npm run test:e2e
```

Playwright will build the app and preview it on port 8080 before running tests (configured in playwright.config.ts).

Note: VITE_* vars are baked at build time — set them in `.env` before building the web image.
