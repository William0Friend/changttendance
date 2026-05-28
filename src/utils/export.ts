/**
 * CSV and JSON export utilities.
 * Embeddings are never exported — only attendance and session metadata.
 */

import type { AttendanceRecord, LocalStudent, Session } from '@/types/index';
import { formatDateTime } from './format';

function download(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export a session's attendance records as CSV.
 * Compatible with Canvas, Blackboard, and Moodle grade book imports.
 */
export function exportSessionCSV(
  session: Session,
  records: AttendanceRecord[],
  students: LocalStudent[],
): void {
  const recordMap = new Map(records.map((r) => [r.studentId, r]));

  const header = ['Student Name', 'Student ID', 'Status', 'Method', 'Confidence', 'Recorded At'];
  const rows = students.map((s) => {
    const rec = recordMap.get(s.id);
    return [
      s.name,
      s.studentId,
      rec?.status ?? 'absent',
      rec?.method ?? '',
      rec?.confidence !== undefined ? `${Math.round(rec.confidence * 100)}%` : '',
      rec ? formatDateTime(rec.recordedAt) : '',
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  download(`attendance_${session.date}_${session.id.slice(0, 8)}.csv`, csv, 'text/csv');
}

/**
 * Export all app data as JSON for backup.
 * Embeddings are intentionally excluded.
 */
export function exportAllDataJSON(data: object): void {
  download(
    `changttendance_backup_${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
  );
}
