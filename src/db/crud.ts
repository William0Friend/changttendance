import { getDB } from './index';
import type {
  LocalClass,
  LocalStudent,
  FaceEmbedding,
  Session,
  AttendanceRecord,
  EnrollmentStatus,
} from '@/types/index';
import { genUUID } from '@/utils/uuid';

// ─── Internal helper ──────────────────────────────────────────────────────────

/** Wraps db.put with Safari QuotaExceededError handling. */
async function safePut(
  storeName: 'classes',
  value: LocalClass,
): Promise<void>;
async function safePut(
  storeName: 'students',
  value: LocalStudent,
): Promise<void>;
async function safePut(
  storeName: 'embeddings',
  value: FaceEmbedding,
): Promise<void>;
async function safePut(
  storeName: 'sessions',
  value: Session,
): Promise<void>;
async function safePut(
  storeName: 'attendanceRecords',
  value: AttendanceRecord,
): Promise<void>;
async function safePut(storeName: string, value: unknown): Promise<void> {
  const db = await getDB();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).put(storeName, value);
  } catch (e) {
    if ((e as Error).name === 'QuotaExceededError') {
      throw new Error('STORAGE_FULL');
    }
    throw e;
  }
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export async function createClass(
  data: Omit<LocalClass, 'id' | 'createdAt'>,
): Promise<LocalClass> {
  const record: LocalClass = { ...data, id: genUUID(), createdAt: new Date().toISOString() };
  await safePut('classes', record);
  return record;
}

export async function getClass(id: string): Promise<LocalClass | undefined> {
  const db = await getDB();
  return db.get('classes', id);
}

export async function listClasses(): Promise<LocalClass[]> {
  const db = await getDB();
  return db.getAll('classes');
}

export async function updateClass(id: string, updates: Partial<LocalClass>): Promise<LocalClass> {
  const db = await getDB();
  const existing = await db.get('classes', id);
  if (!existing) throw new Error(`Class not found: ${id}`);
  const updated: LocalClass = { ...existing, ...updates, id };
  await safePut('classes', updated);
  return updated;
}

// ─── Students ─────────────────────────────────────────────────────────────────

export async function createStudent(
  data: Omit<LocalStudent, 'id' | 'enrolledAt'>,
): Promise<LocalStudent> {
  const record: LocalStudent = { ...data, id: genUUID(), enrolledAt: new Date().toISOString() };
  await safePut('students', record);
  return record;
}

export async function getStudent(id: string): Promise<LocalStudent | undefined> {
  const db = await getDB();
  return db.get('students', id);
}

export async function listStudentsByClass(classId: string): Promise<LocalStudent[]> {
  const db = await getDB();
  return db.getAllFromIndex('students', 'by-class', classId);
}

export async function updateStudent(
  id: string,
  updates: Partial<LocalStudent>,
): Promise<LocalStudent> {
  const db = await getDB();
  const existing = await db.get('students', id);
  if (!existing) throw new Error(`Student not found: ${id}`);
  const updated: LocalStudent = { ...existing, ...updates, id };
  await safePut('students', updated);
  return updated;
}

export async function updateStudentEnrollmentStatus(
  id: string,
  status: EnrollmentStatus,
): Promise<LocalStudent> {
  return updateStudent(id, { enrollmentStatus: status });
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

export async function saveEmbedding(embedding: FaceEmbedding): Promise<void> {
  await safePut('embeddings', embedding);
}

export async function getEmbeddingsByStudent(studentId: string): Promise<FaceEmbedding[]> {
  const db = await getDB();
  return db.getAllFromIndex('embeddings', 'by-student', studentId);
}

export async function getEmbeddingsByClass(classId: string): Promise<FaceEmbedding[]> {
  const db = await getDB();
  return db.getAllFromIndex('embeddings', 'by-class', classId);
}

export async function deleteEmbeddingsByStudent(studentId: string): Promise<void> {
  const db = await getDB();
  const embeddings = await db.getAllFromIndex('embeddings', 'by-student', studentId);
  const tx = db.transaction('embeddings', 'readwrite');
  await Promise.all([
    ...embeddings.map((e) => tx.store.delete(e.id)),
    tx.done,
  ]);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(
  data: Omit<Session, 'id' | 'startedAt'>,
): Promise<Session> {
  const record: Session = { ...data, id: genUUID(), startedAt: new Date().toISOString() };
  await safePut('sessions', record);
  return record;
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function listSessionsByClass(classId: string): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('sessions', 'by-class', classId);
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function updateSession(id: string, updates: Partial<Session>): Promise<Session> {
  const db = await getDB();
  const existing = await db.get('sessions', id);
  if (!existing) throw new Error(`Session not found: ${id}`);
  const updated: Session = { ...existing, ...updates, id };
  await safePut('sessions', updated);
  return updated;
}

export async function finalizeSession(
  sessionId: string,
  records: AttendanceRecord[],
): Promise<void> {
  const db = await getDB();
  const session = await db.get('sessions', sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const finalizedSession: Session = { ...session, finalizedAt: new Date().toISOString() };
  const tx = db.transaction(['sessions', 'attendanceRecords'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').put(finalizedSession),
    ...records.map((r) => tx.objectStore('attendanceRecords').put(r)),
    tx.done,
  ]);
}

// ─── Attendance Records ───────────────────────────────────────────────────────

export async function saveAttendanceRecord(record: AttendanceRecord): Promise<void> {
  await safePut('attendanceRecords', record);
}

export async function getAttendanceBySession(sessionId: string): Promise<AttendanceRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('attendanceRecords', 'by-session', sessionId);
}

export async function getAttendanceByStudent(studentId: string): Promise<AttendanceRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('attendanceRecords', 'by-student', studentId);
}

export async function updateAttendanceRecord(
  id: string,
  updates: Partial<AttendanceRecord>,
): Promise<AttendanceRecord> {
  const db = await getDB();
  const existing = await db.get('attendanceRecords', id);
  if (!existing) throw new Error(`Attendance record not found: ${id}`);
  const updated: AttendanceRecord = {
    ...existing,
    ...updates,
    id,
    editedAt: new Date().toISOString(),
  };
  await safePut('attendanceRecords', updated);
  return updated;
}

// ─── Bulk / Export ────────────────────────────────────────────────────────────

export async function getAllDataForExport(): Promise<{
  classes: LocalClass[];
  students: LocalStudent[];
  sessions: Session[];
  attendanceRecords: AttendanceRecord[];
}> {
  const db = await getDB();
  const [classes, students, sessions, attendanceRecords] = await Promise.all([
    db.getAll('classes'),
    db.getAll('students'),
    db.getAll('sessions'),
    db.getAll('attendanceRecords'),
  ]);
  // Embeddings intentionally excluded — local ML data only, not suitable for export
  return { classes, students, sessions, attendanceRecords };
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const stores = ['embeddings', 'classes', 'students', 'sessions', 'attendanceRecords'] as const;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all([
    ...stores.map((s) => tx.objectStore(s).clear()),
    tx.done,
  ]);
}
