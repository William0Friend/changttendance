import type { DBSchema } from 'idb';
import type {
  FaceEmbedding,
  LocalClass,
  LocalStudent,
  Session,
  AttendanceRecord,
} from '@/types/index';

/**
 * IndexedDB schema version 1.
 * IMPORTANT: No image data is ever stored. Only Float32Array descriptors.
 */
export interface AppDB extends DBSchema {
  embeddings: {
    key: string;
    value: FaceEmbedding;
    indexes: {
      'by-student': string;
      'by-class': string;
    };
  };

  classes: {
    key: string;
    value: LocalClass;
    indexes: {
      'by-enrollment-code': string;
    };
  };

  students: {
    key: string;
    value: LocalStudent;
    indexes: {
      'by-class': string;
      'by-enrollment-status': string;
    };
  };

  sessions: {
    key: string;
    value: Session;
    indexes: {
      'by-class': string;
      'by-date': string;
    };
  };

  attendanceRecords: {
    key: string;
    value: AttendanceRecord;
    indexes: {
      'by-session': string;
      'by-student': string;
    };
  };
}
