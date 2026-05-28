import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AttendanceProvider } from './interface';
import type { ProviderResult, EnrollmentQueueRecord } from '@/types/index';
import { genUUID } from '@/utils/uuid';

const BUCKET = 'enrollment-photos';

export class SupabaseProvider extends AttendanceProvider {
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    super();
    this.client = createClient(url, anonKey);
  }

  /**
   * Upload photo to Supabase Storage, then insert enrollment record.
   * The photo is deleted from storage once the professor approves/rejects.
   */
  async submitEnrollment(
    studentName: string,
    studentId: string,
    email: string | null,
    classId: string,
    photo: Blob,
  ): Promise<ProviderResult<string>> {
    try {
      const id = genUUID();
      const photoPath = `${id}.jpg`;

      const { error: uploadError } = await this.client.storage
        .from(BUCKET)
        .upload(photoPath, photo, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) return { ok: false, error: uploadError.message };

      const record = {
        id,
        student_name: studentName,
        student_id: studentId,
        email: email ?? null,
        class_id: classId,
        photo_path: photoPath,
        submitted_at: new Date().toISOString(),
        status: 'pending',
      };

      const { error: insertError } = await this.client
        .from('enrollment_queue')
        .insert(record);

      if (insertError) {
        // Clean up uploaded photo if DB insert failed
        await this.client.storage.from(BUCKET).remove([photoPath]);
        return { ok: false, error: insertError.message };
      }

      return { ok: true, data: id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Fetch all pending enrollments for a class from the queue table. */
  async getPendingEnrollments(classId: string): Promise<ProviderResult<EnrollmentQueueRecord[]>> {
    try {
      const { data, error } = await this.client
        .from('enrollment_queue')
        .select('*')
        .eq('class_id', classId)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

      if (error) return { ok: false, error: error.message };

      const records: EnrollmentQueueRecord[] = (data ?? []).map((row) => {
        const rec: EnrollmentQueueRecord = {
          id:          row.id as string,
          studentName: row.student_name as string,
          studentId:   row.student_id as string,
          classId:     row.class_id as string,
          photoPath:   row.photo_path as string,
          submittedAt: row.submitted_at as string,
          status:      row.status as 'pending' | 'approved' | 'rejected',
        };
        if (row.email) rec.email = row.email as string;
        if (row.notes) rec.notes = row.notes as string;
        return rec;
      });

      return { ok: true, data: records };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * Download the enrollment photo.
   * IMPORTANT: The caller must call deletePhoto() immediately after processing.
   */
  async importEnrollment(enrollmentId: string): Promise<ProviderResult<Blob>> {
    try {
      const { data: record, error: fetchError } = await this.client
        .from('enrollment_queue')
        .select('photo_path')
        .eq('id', enrollmentId)
        .single();

      if (fetchError || !record) {
        return { ok: false, error: fetchError?.message ?? 'Record not found' };
      }

      const { data: blob, error: downloadError } = await this.client.storage
        .from(BUCKET)
        .download(record.photo_path as string);

      if (downloadError || !blob) {
        return { ok: false, error: downloadError?.message ?? 'Download failed' };
      }

      return { ok: true, data: blob };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Mark enrollment as approved or rejected in the queue table. */
  async updateEnrollmentStatus(
    enrollmentId: string,
    status: 'approved' | 'rejected',
  ): Promise<ProviderResult<void>> {
    try {
      const { error } = await this.client
        .from('enrollment_queue')
        .update({ status })
        .eq('id', enrollmentId);

      if (error) return { ok: false, error: error.message };
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * Delete the photo from Supabase Storage.
   * Must be called immediately after importEnrollment to ensure no photo persists.
   */
  async deletePhoto(photoPath: string): Promise<ProviderResult<void>> {
    try {
      const { error } = await this.client.storage.from(BUCKET).remove([photoPath]);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Ping the REST API to verify the project is reachable and not paused. */
  async healthCheck(): Promise<ProviderResult<boolean>> {
    try {
      const { error } = await this.client
        .from('enrollment_queue')
        .select('id', { count: 'exact', head: true });

      if (error) return { ok: false, error: error.message };
      return { ok: true, data: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

/**
 * Null provider returned when Supabase is not configured.
 * All methods return a not-configured error without throwing.
 */
export class NullProvider extends AttendanceProvider {
  private static readonly ERR = 'Remote enrollment is not configured. Add Supabase credentials in Settings.';

  async submitEnrollment(): Promise<ProviderResult<string>> {
    return { ok: false, error: NullProvider.ERR };
  }
  async getPendingEnrollments(): Promise<ProviderResult<EnrollmentQueueRecord[]>> {
    return { ok: false, error: NullProvider.ERR };
  }
  async importEnrollment(): Promise<ProviderResult<Blob>> {
    return { ok: false, error: NullProvider.ERR };
  }
  async updateEnrollmentStatus(): Promise<ProviderResult<void>> {
    return { ok: false, error: NullProvider.ERR };
  }
  async deletePhoto(): Promise<ProviderResult<void>> {
    return { ok: false, error: NullProvider.ERR };
  }
  async healthCheck(): Promise<ProviderResult<boolean>> {
    return { ok: false, error: NullProvider.ERR };
  }
}
