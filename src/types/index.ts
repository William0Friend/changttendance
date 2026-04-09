// Core type aliases
export type FaceDescriptor = Float32Array;

// ─── Enumerations ────────────────────────────────────────────────────────────

export const enum AttendanceStatus {
  Present      = 'present',
  Absent       = 'absent',
  LowConfidence = 'low_confidence',
  Manual       = 'manual',
}

export const enum EnrollmentStatus {
  Pending    = 'pending',
  Enrolled   = 'enrolled',
  Rejected   = 'rejected',
  Archived   = 'archived',
}

export const enum RecognitionMethod {
  FaceRecognition = 'face_recognition',
  Manual          = 'manual',
}

export const enum FaceQualityGrade {
  Excellent  = 'excellent',
  Good       = 'good',
  Acceptable = 'acceptable',
  Poor       = 'poor',
}

export const enum TFBackend {
  WebGL = 'webgl',
  WASM  = 'wasm',
  CPU   = 'cpu',
}

// ─── Data Entities ────────────────────────────────────────────────────────────

export interface LocalClass {
  id: string;
  name: string;
  code: string;
  enrollmentCode: string;
  /** ISO 8601 date string */
  createdAt: string;
  /** ISO 8601 date string, set when archived */
  archivedAt?: string;
  /** Persisted recognition threshold override for this class (0.4–0.7) */
  threshold?: number;
}

export interface LocalStudent {
  id: string;
  classId: string;
  name: string;
  studentId: string;
  email?: string;
  enrollmentStatus: EnrollmentStatus;
  /** ISO 8601 date string */
  enrolledAt: string;
  /** Provider-side record ID if enrolled via online queue */
  remoteEnrollmentId?: string;
}

export interface FaceEmbedding {
  id: string;
  studentId: string;
  classId: string;
  /** 128-dimensional FaceNet descriptor */
  descriptor: FaceDescriptor;
  /** Quality score 0–1 at capture time */
  quality: number;
  /** ISO 8601 date string */
  capturedAt: string;
}

export interface Session {
  id: string;
  classId: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** ISO 8601 datetime string */
  startedAt: string;
  /** ISO 8601 datetime string, set when session ends */
  finalizedAt?: string;
  notes?: string;
  /** Recognition threshold used for this session */
  threshold: number;
  /** TF backend that was active during this session */
  backend: TFBackend;
  /** Whether adaptive threshold was triggered at any point */
  adaptiveThresholdUsed: boolean;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  classId: string;
  status: AttendanceStatus;
  method: RecognitionMethod;
  /** Euclidean distance from FaceMatcher; undefined for manual entries */
  confidence?: number;
  qualityGrade?: FaceQualityGrade;
  /** Preprocessing steps applied, e.g. ["histogramEq", "sharpen"] */
  preprocessingApplied?: string[];
  /** ISO 8601 datetime string */
  recordedAt: string;
  /** ISO 8601 datetime string of last manual edit */
  editedAt?: string;
}

export interface EnrollmentQueueRecord {
  id: string;
  studentName: string;
  studentId: string;
  email?: string;
  classId: string;
  photoPath: string;
  /** ISO 8601 datetime string */
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Recognition Pipeline ────────────────────────────────────────────────────

export interface DetectionLayerResult {
  /** Bounding box in video coordinate space */
  box: { x: number; y: number; width: number; height: number };
  /** SSD detection confidence 0–1 */
  score: number;
  /** Scale at which this detection was found */
  scale: number;
}

export interface FaceQualityReport {
  detectionScore: number;
  landmarkConfidence: number;
  sharpness: number;
  brightness: number;
  /** Face height as fraction of frame height */
  faceSizeRatio: number;
  /** Absolute head roll angle in degrees */
  headAngle: number;
  grade: FaceQualityGrade;
  /** Which individual checks failed */
  failedChecks: string[];
}

export interface RecognitionResult {
  /** Student ID, or 'unknown' */
  label: string;
  /** Euclidean distance (lower = more confident match) */
  distance: number;
  /** 1 - (distance / threshold), clamped 0–1 */
  confidence: number;
  box: DetectionLayerResult['box'];
  qualityReport: FaceQualityReport;
  preprocessingApplied: string[];
  /** Number of consecutive frames this label has matched */
  consecutiveMatchCount: number;
  /** True when consecutiveMatchCount >= 3 */
  confirmed: boolean;
}

export interface TemporalMatch {
  label: string;
  consecutiveCount: number;
  /** ISO 8601 datetime string of last match */
  lastMatchAt: string;
}

// ─── Session Stats ────────────────────────────────────────────────────────────

export interface SessionStats {
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lowConfidenceCount: number;
  manualCount: number;
  /** Average confidence across all confirmed face matches this session */
  averageConfidence: number;
  /** Highest threshold used (if adaptive relaxation triggered) */
  peakThreshold: number;
  backend: TFBackend;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppState {
  activeClassId: string | null;
  activeSessionId: string | null;
  activeTab: 'attendance' | 'enroll' | 'classes' | 'sessions' | 'settings';
  cameraDeviceId: string | null;
  tfBackend: TFBackend | null;
  /** Whether face-api models have finished loading */
  modelsLoaded: boolean;
  supabaseConfigured: boolean;
  threshold: number;
  adaptiveThresholdEnabled: boolean;
}
