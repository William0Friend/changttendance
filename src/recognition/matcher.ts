/**
 * FaceMatcher wrapper implementing Layer 8 (matching) and Layer 9 (temporal voting).
 *
 * Key rules:
 * - FaceMatcher is built ONCE at session start from all enrolled embeddings.
 * - Never rebuild during scanning — it is expensive.
 * - Temporal voting requires 3 consecutive passes before marking a student present.
 * - Confirmed students are tracked in a Set and skipped from reporting as unknown.
 */

import type { FaceDescriptor, TemporalMatch } from '@/types/index';


const CONFIRM_PASSES = 3;

export interface MatcherState {
  matcher: { findBestMatch(d: Float32Array): { label: string; distance: number } } | null;
  temporal: Map<string, TemporalMatch>;
  confirmed: Set<string>;
  threshold: number;
}

export function createMatcherState(threshold: number): MatcherState {
  return {
    matcher:   null,
    temporal:  new Map(),
    confirmed: new Set(),
    threshold,
  };
}

/**
 * Build FaceMatcher from enrolled descriptors.
 * Must be called before the first scan pass, and NEVER rebuilt mid-session.
 *
 * @param descriptorsByStudent - studentId → array of descriptors (multiple captures per student)
 * @param threshold - euclidean distance threshold (lower = stricter)
 */
export function buildMatcher(
  descriptorsByStudent: Map<string, FaceDescriptor[]>,
  state: MatcherState,
): void {
  const labeled = Array.from(descriptorsByStudent.entries())
    .filter(([, descs]) => descs.length > 0)
    .map(([label, descs]) => new faceapi.LabeledFaceDescriptors(label, descs));

  if (labeled.length === 0) {
    state.matcher = null;
    return;
  }

  state.matcher = new faceapi.FaceMatcher(labeled, state.threshold);
}

/**
 * Find the best matching student for a descriptor.
 * Returns null if no matcher exists or if no student is close enough.
 */
export function matchDescriptor(
  state: MatcherState,
  descriptor: FaceDescriptor,
): { label: string; distance: number } | null {
  if (!state.matcher) return null;
  const result = state.matcher.findBestMatch(descriptor);
  if (result.label === 'unknown') return null;
  return result;
}

/**
 * Record a match for temporal voting (Layer 9).
 * Returns whether this match just crossed the confirmation threshold.
 */
export function recordMatch(
  state: MatcherState,
  studentId: string,
): { justConfirmed: boolean; consecutiveCount: number } {
  const existing = state.temporal.get(studentId);
  const count    = (existing?.consecutiveCount ?? 0) + 1;

  state.temporal.set(studentId, {
    label:            studentId,
    consecutiveCount: count,
    lastMatchAt:      new Date().toISOString(),
  });

  if (!state.confirmed.has(studentId) && count >= CONFIRM_PASSES) {
    state.confirmed.add(studentId);
    return { justConfirmed: true, consecutiveCount: count };
  }

  return { justConfirmed: false, consecutiveCount: count };
}

/** Clear the consecutive streak for a student (when they miss a scan pass). */
export function clearStreak(state: MatcherState, studentId: string): void {
  state.temporal.delete(studentId);
}

export function isConfirmed(state: MatcherState, studentId: string): boolean {
  return state.confirmed.has(studentId);
}

export function getConsecutiveCount(state: MatcherState, studentId: string): number {
  return state.temporal.get(studentId)?.consecutiveCount ?? 0;
}
