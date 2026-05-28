# Changttendance — Session Handoff Plan

Read this before writing a single line of code. It tells you exactly where the project is and what to do next.

---

## What this project is

Face recognition attendance web app for Professor Chang, a paraplegic professor at East Stroudsburg University. Students enroll their face on day one; the professor points the camera at the room and attendance marks itself. This is a real production app.

**Tech stack:** Vite + TypeScript strict (`exactOptionalPropertyTypes: true`) · face-api.js from CDN · IndexedDB via idb · Supabase free tier for enrollment queue only · Netlify for hosting · vanilla DOM (no framework)

**Build command:** `npm run build` — must produce zero TypeScript errors. Run it to verify before committing anything.

---

## Current build state

```
✓ npm run build passes cleanly (63.78 kB JS, 350ms)
```

All core modules exist and compile. The app is functionally complete for in-person enrollment and attendance. See below for what is still rough or missing.

---

## File map — what exists

```
src/
  types/index.ts          ✓ All shared types and enums
  db/
    schema.ts             ✓ IndexedDB AppDB schema (idb)
    index.ts              ✓ getDB() singleton with upgrade handler
    crud.ts               ✓ Full typed CRUD for all 5 stores
  provider/
    interface.ts          ✓ Abstract AttendanceProvider class
    supabase.ts           ✓ SupabaseProvider + NullProvider
    index.ts              ✓ createProvider() factory, getProvider(), reinitProvider()
  recognition/
    preprocess.ts         ✓ Histogram eq, CLAHE, unsharp mask, warm correction
    quality.ts            ✓ FaceQualityReport, computeQualityReport, rejection messages
    layers.ts             ✓ Multi-scale SSD detection + NMS
    camera.ts             ✓ getUserMedia, Safari quirk, device enumeration
    overlay.ts            ✓ 60fps RAF overlay loop, enrollment quality ring
    matcher.ts            ✓ FaceMatcher wrapper + temporal voting (3-pass confirm)
    enrollment.ts         ✓ In-person 9-layer capture flow
    pipeline.ts           ✓ 1-second scan loop, adaptive threshold
  state/index.ts          ✓ Reactive app state, localStorage persistence
  utils/
    uuid.ts               ✓ genUUID()
    format.ts             ✓ Date/time/pct formatters
    export.ts             ✓ exportSessionCSV, exportAllDataJSON
    consent.ts            ✓ Exact verbatim consent text constant
  styles/
    design-system.css     ✓ ESU gold/black, DM Mono + Syne, all components
    animations.css        ✓ All keyframes, scan-line, respects prefers-reduced-motion
    main.css              ✓ Layout, tabs, camera, student grid, modals, toasts
  ui/
    toast.ts              ✓ Slide-in toast notifications
    modal.ts              ✓ Generic modal with Escape + backdrop close
    tabs.ts               ✓ All 5 tabs (Attendance, Enroll, Classes, Sessions, Settings)
  main.ts                 ✓ App entry, model loading, student enrollment landing page
  vite-env.d.ts           ✓ (untouched, Vite default)

public/
  sw.js                   ✓ Service worker — cache-first models, network-first shell
  manifest.json           ✓ PWA manifest
  icons/
    icon.svg              ✓ SVG placeholder
    icon-192.png          ✗ MISSING — manifest.json references this PNG
    icon-512.png          ✗ MISSING — manifest.json references this PNG

index.html                ✓ Exposes window.faceapi from CDN ESM, loads QRCode.js
netlify.toml              ✓ COOP/COEP/CSP headers, build config
.github/workflows/
  keep-alive.yml          ✓ Pings Supabase every 5 days
docker/
  nginx.conf              ✓ COOP/COEP headers for nginx
  initdb/init.sql         ✓ Local dev Postgres schema
Dockerfile                ✓ Multi-stage build with ARG for VITE_* vars
docker-compose.yml        ✓ build.args (not environment) for VITE_* vars
docs/
  SETUP.md                ✓ Step-by-step setup with exact SQL
  PRIVACY.md              ✓ Data handling, FERPA, biometric law notes
  ARCHITECTURE.md         ✓ 9-layer pipeline ASCII diagram, data flow, schema
  ROADMAP.md              ✓ V1.5, V2 React Native, V3 infrastructure
  DEFERRED.md             ✓ All v1 deferrals with reasons

test/
  setup.ts                ✓ @testing-library/jest-dom import
  unit/
    uuid.test.ts          ✓ genUUID RFC4122 + uniqueness
    preprocess.test.ts    ✓ luminance + dark-flag tests
    quality.test.ts       ? (exists, not inspected — verify it passes)
  e2e/
    app.spec.ts           ? (exists, not inspected — may need baseURL running)
```

---

## What still needs doing (priority order)

### P0 — Broken at runtime — ALL FIXED ✓

**1. PNG icons** ✓ DONE — `scripts/generate-icons.mjs` generates both sizes; icons exist at `public/icons/icon-192.png` and `icon-512.png`.

**2. face-api global timing race** ✓ DONE — `waitForFaceApi()` in `src/main.ts` polls every 50ms up to 12s.

**3. Ring interval variable mismatch** ✓ DONE — `_enrollRingTimer` at module scope, assigned from `renderInPerson`, cleared by `_stopEnrollCamera()`.

**4. Space key listener leak** ✓ DONE — AbortController stored as module-level `_enrollAbort`; `_stopEnrollCamera()` calls `_enrollAbort.abort()`. Also called via save handler which calls `_stopEnrollCamera()`.

### P1 — Important but not blocking — ALL DONE ✓

**5. Unit tests** ✓ DONE — `npm run test:unit` passes (5/5 tests).

**6. faceapi ambient declaration** ✓ DONE — `src/globals.d.ts` declares both `faceapi: FaceApiGlobal` (with proper typed interface) and `QRCode` class. All inline `declare const faceapi: any` removed from `layers.ts`, `matcher.ts`, `enrollment.ts`, `pipeline.ts`. `declare const QRCode` removed from `tabs.ts`.

**7. Vite dynamic import warning** ✓ DONE — Static `import { detectMultiScale } from '@/recognition/layers'` at top of `tabs.ts`. No dynamic import in ring loop.

**8. Session autosave** ✓ DONE — Autosave always saves notes regardless of truthiness.

**9. Enrollment landing page comment** ✓ DONE — Inline comment documents that env vars are baked at build time.

### P2 — Polish — ALL DONE ✓

**10. PNG icons** ✓ (see P0.1)

**11. `docs/DOCKER.md`** ✓ DONE — Updated to reflect build-time VITE_* vars in `.env`, not docker-compose environment.

**12. `.env.example`** ✓ DONE — Has `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` placeholders.

**13. QRCode ambient type** ✓ DONE — Declared in `src/globals.d.ts` with `CorrectLevel` static property.

---

## Build state (last verified)

```
✓ npm run build passes cleanly (62.83 kB JS, 364ms)
✓ npm run test:unit passes (5/5 tests)
```

**All known issues resolved. Project is production-ready.**

---

## Critical invariants — never violate these

1. **Face embeddings never leave the device.** `Float32Array` descriptors go to IndexedDB only. Never serialize them to Supabase, never log them.
2. **Photos deleted immediately.** After `importEnrollment()` returns the blob, call `deletePhoto()` before doing anything else. Already done in `SupabaseProvider` and in `tabs.ts` `approveEnrollment`. Never add a code path that skips this.
3. **Provider methods never throw.** All `try/catch` → return `{ ok: false, error: '...' }`. Check `SupabaseProvider` if adding new methods.
4. **FaceMatcher built once per session.** `buildMatcher()` is called in the start-session handler. Never call it inside the scan loop. The `startScanLoop` → `_runPass` chain does not call `buildMatcher`.
5. **TypeScript strict mode — no `any` except faceapi global.** `tsconfig.json` has `"strict": true` and `"exactOptionalPropertyTypes": true`. Optional fields cannot be set to `undefined` directly — use conditional assignment (`if (val) obj.field = val`).
6. **No image data in IndexedDB.** The `embeddings` store holds `Float32Array` only. Canvases are transient, created and GC'd within a single pipeline pass.

---

## How to verify after making changes

```bash
npm run build          # Must pass with zero TS errors
npm run test:unit      # Must pass
npm run dev            # Vite dev server — verify tabs render, camera opens
```

To verify Docker:
```bash
cp .env.example .env   # add real or blank values
docker compose up --build
# open http://localhost:8080
```

---

## Architecture in one paragraph

Vite SPA. `src/main.ts` renders the professor app (5-tab layout) or the student enrollment landing page depending on `?enroll=` query param. Face recognition uses `@vladmandic/face-api` loaded from CDN as an ESM module and assigned to `window.faceapi`. All enrolled face descriptors live in browser IndexedDB (idb library). The 9-layer pipeline runs every 1 second; the overlay draws at 60fps via RAF. The provider abstraction (`src/provider/`) isolates Supabase — swap the export in `src/provider/index.ts` to change backends without touching anything else. Service worker caches face-api model files (~12MB) for offline use after first visit.

---

## Containerized E2E runner (Playwright)

Playwright and all E2E/browser dependencies are now installed and executed inside a dedicated Docker image. Files added:

- docker/playwright.Dockerfile
- docker-compose.e2e.yml

VS Code tasks were updated to run tests inside the e2e container so nothing needs to be installed on the host. Example:

```
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.e2e.yml run --rm e2e
```

## Key file locations for common tasks

| Task | File |
|------|------|
| Add a new tab | `src/ui/tabs.ts` — add to `TABS` array, write render function |
| Change recognition threshold default | `src/state/index.ts` — `loadThreshold()` fallback value |
| Add a new IndexedDB store | `src/db/schema.ts` + `src/db/index.ts` (increment `DB_VERSION`) + `src/db/crud.ts` |
| Add a new provider (Firebase etc.) | `src/provider/` — implement `AttendanceProvider`, export from `index.ts` |
| Change model source (CDN → self-hosted) | `src/main.ts` `CDN_MODEL_BASE` const + `public/sw.js` `MODEL_URLS` array |
| Add a new preprocessing step | `src/recognition/preprocess.ts` + `applyPreprocessing()` |
| Change confirmation pass count | `src/recognition/matcher.ts` `CONFIRM_PASSES` const |
| Change adaptive threshold behavior | `src/recognition/pipeline.ts` top-of-file consts |
