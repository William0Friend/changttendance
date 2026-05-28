/**
 * Lightweight reactive app state.
 * Observer pattern — no framework required.
 * Some fields are persisted to localStorage across sessions.
 */

import type { AppState } from '@/types/index';

const LS_THRESHOLD = 'ch_threshold';
const LS_ADAPTIVE  = 'ch_adaptive';
const LS_CAMERA    = 'ch_camera';

function loadThreshold(): number {
  const v = localStorage.getItem(LS_THRESHOLD);
  const n = v ? parseFloat(v) : NaN;
  return isNaN(n) ? 0.55 : Math.min(0.7, Math.max(0.4, n));
}

const _state: AppState = {
  activeClassId:          null,
  activeSessionId:        null,
  activeTab:              'attendance',
  cameraDeviceId:         localStorage.getItem(LS_CAMERA) ?? null,
  tfBackend:              null,
  modelsLoaded:           false,
  supabaseConfigured:     false,
  threshold:              loadThreshold(),
  adaptiveThresholdEnabled: localStorage.getItem(LS_ADAPTIVE) === 'true',
};

type Listener = (state: Readonly<AppState>) => void;
const listeners = new Set<Listener>();

export function getState(): Readonly<AppState> {
  return _state;
}

export function setState(updates: Partial<AppState>): void {
  Object.assign(_state, updates);

  if (updates.threshold !== undefined) {
    localStorage.setItem(LS_THRESHOLD, String(updates.threshold));
  }
  if (updates.adaptiveThresholdEnabled !== undefined) {
    localStorage.setItem(LS_ADAPTIVE, String(updates.adaptiveThresholdEnabled));
  }
  if ('cameraDeviceId' in updates) {
    if (updates.cameraDeviceId) {
      localStorage.setItem(LS_CAMERA, updates.cameraDeviceId);
    } else {
      localStorage.removeItem(LS_CAMERA);
    }
  }

  for (const fn of listeners) fn(_state);
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
