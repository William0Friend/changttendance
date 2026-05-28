import { AttendanceProvider } from './interface';
import type { ProviderResult, EnrollmentQueueRecord } from '@/types/index';

export class LocalApiProvider extends AttendanceProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    super();
    this.baseUrl = (baseUrl ?? '/api').replace(/\/$/, '');
  }

  async submitEnrollment(
    studentName: string,
    studentId: string,
    email: string | null,
    classId: string,
    photo: Blob,
  ): Promise<ProviderResult<string>> {
    try {
      const form = new FormData();
      form.append('studentName', studentName);
      form.append('studentId', studentId);
      form.append('email', email ?? '');
      form.append('classId', classId);
      form.append('photo', photo, 'photo.jpg');

      const res = await fetch(`${this.baseUrl}/enrollments`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'request failed' };
      return { ok: true, data: json.id as string };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async getPendingEnrollments(classId: string): Promise<ProviderResult<EnrollmentQueueRecord[]>> {
    try {
      const res = await fetch(`${this.baseUrl}/enrollments/pending?classId=${encodeURIComponent(classId)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'request failed' };
      const records = (json.data ?? []).map((r: any) => ({
        id: r.id as string,
        studentName: r.student_name as string,
        studentId: r.student_id as string,
        classId: r.class_id as string,
        photoPath: r.photo_path as string,
        submittedAt: r.submitted_at as string,
        status: r.status as 'pending' | 'approved' | 'rejected',
        email: r.email ?? undefined,
        notes: r.notes ?? undefined,
      }));
      return { ok: true, data: records };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async importEnrollment(enrollmentId: string): Promise<ProviderResult<Blob>> {
    try {
      const res = await fetch(`${this.baseUrl}/enrollments/${enrollmentId}/photo`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        return { ok: false, error: json?.error ?? 'download failed' };
      }
      const blob = await res.blob();
      return { ok: true, data: blob };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async updateEnrollmentStatus(enrollmentId: string, status: 'approved' | 'rejected'): Promise<ProviderResult<void>> {
    try {
      const res = await fetch(`${this.baseUrl}/enrollments/${enrollmentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'request failed' };
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async deletePhoto(photoPath: string): Promise<ProviderResult<void>> {
    try {
      const url = `${this.baseUrl}/enrollments/photo?path=${encodeURIComponent(photoPath)}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'request failed' };
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async healthCheck(): Promise<ProviderResult<boolean>> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      const json = await res.json();
      if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'healthcheck failed' };
      return { ok: true, data: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
