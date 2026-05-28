# Roadmap

## V1.5 — Near term

- **Liveness detection** — Eye Aspect Ratio blink detection during enrollment. Requires one complete blink cycle before a capture is accepted, preventing photo spoofing.
- **LMS-compatible CSV export** — Canvas, Blackboard, and Moodle grade book column formats.
- **Full JSON session export** — Complete session data including confidence scores and preprocessing metadata.
- **Encrypted local backup** — Web Crypto API AES-GCM encryption of IndexedDB face embeddings, exportable as an encrypted `.changttendance` archive.
- **Low confidence audit workflow** — Tab for reviewing all low-confidence attendance records. Professor confirms or rejects each one; audit trail stored.
- **Duplicate name detection** — Fuzzy string match on student names during enrollment with merge suggestion.
- **Per-class PIN** — 4-digit PIN for shared devices so multiple professors can use one installation.
- **Re-enrollment request flow** — Flag a student for re-capture when recognition accuracy drops below a threshold across multiple sessions.

## V2 — React Native (Android first)

| Web | Mobile |
|-----|--------|
| `getUserMedia` | VisionCamera v4 (C++ frame processor) |
| `@vladmandic/face-api` | `react-native-fast-tflite` (NNAPI/CoreML) |
| IndexedDB | MMKV |
| `idb` typed CRUD | MMKV typed wrappers |
| Vite | Expo SDK + Router |
| Netlify | EAS free tier (Android APK, no Mac needed) |

The provider abstraction layer, Supabase schema, and 9-layer pipeline logic carry over unchanged. iOS support follows Android validation.

## V3 — Scale

- Multi-professor authentication and cloud sync (session records only — never embeddings)
- LMS grade passback (Canvas API, Moodle webservice)
- Open REST API for third-party event attendance (conferences, building access)
- Voice check-in fallback for accessibility
- Fingerprint enrollment option when camera quality is consistently poor

## Infrastructure

- OpenTofu + Ansible IaC for self-hosted deployment on any VPS
- S3-compatible storage abstraction (DigitalOcean Spaces, Backblaze B2, Cloudflare R2, MinIO)
- Self-hosted Postgres on Hetzner (~€4/month vs Supabase Pro at $25/month)
- Makefile targets: `provision`, `configure`, `migrate`, `backup`, `restore`, `destroy`
- Stripe Payment Links: one-time Pro license ($9.99) + optional cloud sync add-on ($4.99/month)
