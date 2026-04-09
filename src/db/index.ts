import { openDB, type IDBPDatabase } from 'idb';
import type { AppDB } from './schema';

const DB_NAME = 'changttendance';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<AppDB> | null = null;

/**
 * Opens the IndexedDB database, creating stores and indexes on first run.
 * Returns the cached instance on subsequent calls.
 */
export async function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // embeddings: face descriptors — no image data stored here
        const embeddings = db.createObjectStore('embeddings', { keyPath: 'id' });
        embeddings.createIndex('by-student', 'studentId');
        embeddings.createIndex('by-class', 'classId');

        // classes
        const classes = db.createObjectStore('classes', { keyPath: 'id' });
        classes.createIndex('by-enrollment-code', 'enrollmentCode');

        // students
        const students = db.createObjectStore('students', { keyPath: 'id' });
        students.createIndex('by-class', 'classId');
        students.createIndex('by-enrollment-status', 'enrollmentStatus');

        // sessions
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('by-class', 'classId');
        sessions.createIndex('by-date', 'date');

        // attendanceRecords
        const records = db.createObjectStore('attendanceRecords', { keyPath: 'id' });
        records.createIndex('by-session', 'sessionId');
        records.createIndex('by-student', 'studentId');
      }
    },
    blocked() {
      console.warn('DB upgrade blocked by another open tab');
    },
    blocking() {
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Closes the database connection. Call before a version upgrade.
 */
export function closeDB(): void {
  dbInstance?.close();
  dbInstance = null;
}
