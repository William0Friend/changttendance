import type { ProviderResult, EnrollmentQueueRecord } from '@/types/index';

/**
 * Abstract base class for all remote enrollment providers.
 *
 * Design contract:
 * - All methods return Promise<ProviderResult<T>> — they NEVER throw.
 * - On failure, return { ok: false, error: 'description' }.
 * - On success, return { ok: true, data: value }.
 * - Photos are temporary; deletePhoto must be called immediately after importEnrollment.
 *
 * To swap providers: update provider/index.ts to export a different implementation.
 */
export abstract class AttendanceProvider {
  /**
   * Submit a student enrollment photo to the remote queue for professor review.
   *
   * @param studentName - Full name of the student
   * @param studentId - University-assigned student ID
   * @param email - Student email address, or null if not provided
   * @param classId - Local class ID the student is enrolling into
   * @param photo - JPEG photo blob (will be deleted server-side immediately after processing)
   * @returns The remote enrollment record ID on success
   */
  abstract submitEnrollment(
    studentName: string,
    studentId: string,
    email: string | null,
    classId: string,
    photo: Blob,
  ): Promise<ProviderResult<string>>;

  /**
   * Retrieve all pending enrollment submissions for a class.
   *
   * @param classId - Local class ID to filter by
   * @returns Array of pending EnrollmentQueueRecord objects
   */
  abstract getPendingEnrollments(classId: string): Promise<ProviderResult<EnrollmentQueueRecord[]>>;

  /**
   * Download the enrollment photo blob for processing.
   * IMPORTANT: Call deletePhoto immediately after this returns successfully.
   * The photo must never be stored to disk or IndexedDB.
   *
   * @param enrollmentId - Remote enrollment record ID
   * @returns Blob of the enrollment photo (JPEG)
   */
  abstract importEnrollment(enrollmentId: string): Promise<ProviderResult<Blob>>;

  /**
   * Update the status of an enrollment record after professor review.
   *
   * @param enrollmentId - Remote enrollment record ID
   * @param status - 'approved' if imported successfully, 'rejected' if declined
   */
  abstract updateEnrollmentStatus(
    enrollmentId: string,
    status: 'approved' | 'rejected',
  ): Promise<ProviderResult<void>>;

  /**
   * Delete a photo from remote storage.
   * Must be called immediately after importEnrollment — do not defer.
   * This is the privacy guarantee: no photo persists after processing.
   *
   * @param photoPath - Storage path from the EnrollmentQueueRecord
   */
  abstract deletePhoto(photoPath: string): Promise<ProviderResult<void>>;

  /**
   * Check if the provider is reachable and properly configured.
   * Used by the Settings tab "Test Connection" button.
   *
   * @returns true if the provider is healthy and responsive
   */
  abstract healthCheck(): Promise<ProviderResult<boolean>>;
}
