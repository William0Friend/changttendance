# Architecture

## 9-Layer Recognition Pipeline

```
Video frame (1280×720)
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 1: Multi-scale SSD MobileNet detection   │
   │  Scales: 1.0×, 1.5×, 0.75×                     │
   │  NMS merges duplicate detections                │
   └────┬────────────────────────────────────────────┘
        │ per detected face box
   ┌────▼────────────────────────────────────────────┐
   │  Layer 2: Crop + luminance/sharpness assessment │
   │  Flags: dark, bright, blurry, fluorescent       │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 3: Adaptive preprocessing (preprocess.ts)│
   │  - Histogram equalization (dark)                │
   │  - CLAHE approximation (very dark + contrast)   │
   │  - Unsharp mask (blurry)                        │
   │  - Warm color correction (fluorescent)          │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 4+5: Landmark detection + alignment       │
   │  Face Landmark 68-point net                     │
   │  Eye positions → affine transform → upright crop│
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 6: Quality scoring (quality.ts)           │
   │  Grade: Excellent / Good / Acceptable / Poor    │
   │  Poor crops are discarded — no FaceMatcher call │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 7: Descriptor extraction                 │
   │  ResNet-34 → 128-float FaceDescriptor           │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 8: FaceMatcher (matcher.ts)               │
   │  Euclidean distance → confidence score          │
   │  Built ONCE at session start, never rebuilt     │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Layer 9: Temporal voting (matcher.ts)           │
   │  3 consecutive matches → mark Present           │
   │  Eliminates false positives from motion blur    │
   └────┬────────────────────────────────────────────┘
        │
   AttendanceRecord saved to IndexedDB
```

## Data flow

```
┌─────────────────────────────────────┐
│         Professor's Browser         │
│                                     │
│  IndexedDB                          │
│  ├── classes                        │
│  ├── students                       │
│  ├── embeddings (Float32Array only) │  ← never leaves device
│  ├── sessions                       │
│  └── attendanceRecords              │
│                                     │
│  face-api models (CDN → SW cache)   │
└─────────────────┬───────────────────┘
                  │ enrollment photo upload (temporary)
                  │ enrollment record (pending)
                  ▼
         ┌─────────────────┐
         │    Supabase     │
         │  enrollment_queue│
         │  enrollment-photos│  ← deleted on approval
         └─────────────────┘
                  │ download + delete
                  ▼
         Professor approves → descriptor extracted → photo deleted
         Descriptor stored in local IndexedDB
```

## Provider abstraction

To swap from Supabase to another backend, edit `src/provider/index.ts`:

```typescript
// Current:
return new SupabaseProvider(url, key);

// Firebase example:
import { FirebaseProvider } from './firebase';
return new FirebaseProvider(config);

// Self-hosted REST API:
import { RestProvider } from './rest';
return new RestProvider('https://api.example.com', apiKey);
```

The rest of the codebase never changes — all provider calls go through `getProvider()`.

## IndexedDB schema (v1)

| Store | Key | Indexes |
|-------|-----|---------|
| `embeddings` | `id` | `by-student`, `by-class` |
| `classes` | `id` | `by-enrollment-code` |
| `students` | `id` | `by-class`, `by-enrollment-status` |
| `sessions` | `id` | `by-class`, `by-date` |
| `attendanceRecords` | `id` | `by-session`, `by-student` |

Face embeddings are stored as `Float32Array` (128 floats, 512 bytes each). No image data is ever written to any store.

## Offline mode

After the first visit, the service worker caches:
- All face-api model files (~12MB)
- The app shell (HTML, JS, CSS)
- CDN assets (face-api ESM, QRCode.js, fonts)

Subsequent visits work fully offline for in-person enrollment and attendance. Only the online enrollment queue requires a network connection.
