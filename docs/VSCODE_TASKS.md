# VS Code tasks — Changttendance

This file documents the VS Code tasks defined in `.vscode/tasks.json` and explains a few operational caveats.

Tasks (labels):

- Changttendance: Start (docker compose up)
  - Builds images and starts containers detached: `docker compose up -d --build`.
- Changttendance: Stop
  - Stops and removes containers: `docker compose down`.
- Changttendance: Build Images
  - Builds Docker images: `docker compose build`.
- Changttendance: DB Init (run init SQL)
  - Runs the bootstrap SQL inside the `db` container: `psql -U chang -d changttendance -f /docker-entrypoint-initdb.d/init.sql`.
  - Safe to run once on a fresh DB; will print a friendly message if the schema already exists.
- Changttendance: Reset DB (drop & recreate)
  - Destructive: drops `public` schema and re-runs `init.sql`. Use only when you want to wipe local DB state.
- Changttendance: Logs (follow web)
  - Tail container logs for the `web` service: `docker compose logs -f web`.
- Changttendance: Install dependencies
  - Installs node dependencies (CI style): `npm ci`.
- Changttendance: Dev Server
  - Runs the Vite dev server: `npm run dev` (useful for local development with HMR).
- Changttendance: Preview (dist)
  - Builds production assets and serves them locally: `npm run build && npx vite preview --port 8080`.
- Changttendance: Run Unit Tests
  - Runs Vitest unit tests inside the e2e container: `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.e2e.yml run --rm e2e npm run test:unit`.
- Changttendance: Run E2E Tests
  - Runs Playwright E2E tests inside the e2e container: `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.e2e.yml run --rm e2e`.
  - Note: Playwright and browser dependencies are installed inside the e2e container; do not install Playwright on your host machine.
- Changttendance: Run All Tests
  - Runs both unit and e2e inside the e2e container: `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.e2e.yml run --rm e2e npm test`.
- 🚀 Changttendance: First-Time Setup
  - Composite task: Install deps, build images, start containers, and init DB (safe startup path for new devs).

Notes and caveats

- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are baked into the web image at build time. Set them in a `.env` file or export them in your shell before running `docker compose build` or the composite First-Time Setup.

- DB Init vs Reset: `DB Init (run init SQL)` is idempotent on a fresh DB but may fail if run repeatedly; `Reset DB` drops the schema and is destructive. Back up any data you care about before resetting.

- Host Postgres conflicts: The compose file maps port `5432` on the host. If a local Postgres already listens on 5432, either stop it or change the mapping in `docker-compose.yml`.

- Customization: If you change the Postgres user, database name, or locations, update the DB Init/Reset tasks to match.

How to run a task

- In VS Code: Command Palette → Tasks: Run Task → select a task.
- Or open the Terminal pane and run `npx vscode-tasks` (or run the commands directly).

If you'd like, add a short entry to `docs/SETUP.md` pointing to this file.

Local API server (Postgres-backed)
- A lightweight Node API server is included at ./server and runs in its own container using docker-compose.override.yml. It provides:
  - POST /api/enrollments (multipart/form-data) — submit student enrollments (photo).
  - GET /api/enrollments/pending?classId=... — list pending enrollments.
  - GET /api/enrollments/:id/photo — download enrollment photo (call deletePhoto after processing).
  - POST /api/enrollments/:id/status — update status to approved/rejected.
  - DELETE /api/enrollments/:id/photo and DELETE /api/enrollments/photo?path=... — delete photos.
  - GET /api/health — health check.

How to use the local provider:
- The web app will use the Local API provider if the build-time env VITE_USE_LOCAL_API=true or VITE_LOCAL_API_URL is set. When developing in containers, nginx proxies /api to the server, so use /api as the base URL.
- Start everything: in VS Code run the task "Changttendance: Start (docker compose up)" or run: `docker compose up -d`.
- Initialize DB: run the task "Changttendance: DB Init".
- Visit http://localhost:8080 to open the web app. The student enrollment landing page uses the same domain and will call /api endpoints.
 
