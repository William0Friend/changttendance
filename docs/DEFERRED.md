# Deferred Features (V1)

The following features were explicitly not built in V1. Each entry includes the reason so future contributors understand the decision.

| Feature | Reason |
|---------|--------|
| **Liveness detection (blink)** | Requires Eye Aspect Ratio landmark tracking across frames — significant additional complexity. Deferred to V1.5 where it can be added without restructuring enrollment. |
| **Encrypted local backup** | Web Crypto AES-GCM is straightforward but the UX for key management (passphrase, recovery) needs careful design to avoid locking professors out of their own data. Deferred to V1.5. |
| **Per-class PIN** | Shared-device scenarios are uncommon for this user (single professor). Deferred to V1.5. |
| **LMS API grade passback** | Requires OAuth flows for Canvas/Moodle — too much scope for V1. CSV export covers the immediate need. |
| **Re-enrollment request flow** | Tracking accuracy degradation per student over time requires session analytics not yet in the schema. Deferred to V1.5. |
| **React Native app** | Planned for V2. Web app covers 100% of the stated use case for V1. |
| **Multi-professor auth** | Single professor is the entire V1 user base. Cloud sync without a backend is premature. Deferred to V3. |
| **Voice check-in** | Accessibility enhancement. The manual toggle on the student card covers the immediate accessibility need. |
| **Fingerprint enrollment** | Biometric API browser support is inconsistent. Deferred until V2 native app where the APIs are reliable. |
| **Audit trail export** | Session CSV covers the immediate compliance need. Full audit log export deferred to V1.5. |
| **Offline PWA install prompt** | The service worker is in place. A custom install prompt UI is UX polish, not functionality. Deferred to V1.5. |
| **PNG icons (192px, 512px)** | SVG icon is in place. Converting to PNG requires a build step or tool. Add PNG exports before production PWA install is advertised. |
| **Self-hosted Postgres provider** | Provider abstraction is ready. Implementing a REST provider for self-hosted Postgres is infrastructure work, deferred until there is demand. |
| **Duplicate student detection** | Fuzzy name matching on enrollment is a nice-to-have safety net, not a core requirement. Deferred to V1.5. |
