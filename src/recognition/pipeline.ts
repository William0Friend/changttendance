/**
 * 9-layer recognition pipeline orchestrator.
 *
 * Timing model:
 * - Detection loop: runs every 1000ms via setInterval (async, does not block overlay)
 * - Overlay loop:   runs at 60fps via requestAnimationFrame (reads shared results, never blocks)
 *
 * Layer summary:
 *   1. Multi-scale SSD detection + NMS
 *   2. Crop + luminance/sharpness assessment
 *   3. Adaptive preprocessing (histogram eq, CLAHE, sharpen, warm correct)
 *   4+5. Landmark detection + geometric alignment (via face-api withFaceLandmarks)
 *   6. Quality scoring — poor crops are discarded without running FaceMatcher
 *   7. Descriptor extraction (ResNet-34 128-float via withFaceDescriptors)
 *   8. FaceMatcher matching — converts euclidean distance to confidence
 *   9. Temporal debouncing — 3 consecutive passes required before marking present
 *
 * Adaptive threshold: if average confidence stays below 0.65 for 5+ matches,
 * the threshold is relaxed by 0.05 and the professor is notified.
 */

import { detectMultiScale } from './layers';
import { assessPreprocessing, applyPreprocessing } from './preprocess';
import { computeQualityReport } from './quality';
import {
  matchDescriptor,
  recordMatch,
  clearStreak,
  isConfirmed,
  type MatcherState,
} from './matcher';
import { updateOverlayResults, type OverlayEntry } from './overlay';


const PIPELINE_INTERVAL_MS          = 1000;
const ADAPTIVE_MIN_SAMPLES          = 5;
const ADAPTIVE_CONFIDENCE_THRESHOLD = 0.65;
const ADAPTIVE_RELAX_AMOUNT         = 0.05;

export interface PipelineCallbacks {
  onStudentConfirmed?: (studentId: string) => void;
  onUnknownFace?: ()                        => void;
  onAdaptiveThreshold?: (newThreshold: number) => void;
}

export interface PipelineState {
  running:               boolean;
  _intervalId:           ReturnType<typeof setInterval> | null;
  unknownFaceCount:      number;
  adaptiveThresholdActive: boolean;
  /** Confidence samples for adaptive threshold detection */
  _confidenceSamples:    number[];
  callbacks:             PipelineCallbacks;
}

export function createPipelineState(callbacks: PipelineCallbacks = {}): PipelineState {
  return {
    running:               false,
    _intervalId:           null,
    unknownFaceCount:      0,
    adaptiveThresholdActive: false,
    _confidenceSamples:    [],
    callbacks,
  };
}

/**
 * Start the 1-second scan loop.
 * Does nothing if already running.
 */
export function startScanLoop(
  video: HTMLVideoElement,
  matcherState: MatcherState,
  pipelineState: PipelineState,
): void {
  if (pipelineState.running) return;
  pipelineState.running = true;

  pipelineState._intervalId = setInterval(() => {
    void _runPass(video, matcherState, pipelineState);
  }, PIPELINE_INTERVAL_MS);
}

/** Stop the scan loop and clear overlay results. */
export function stopScanLoop(
  overlayCanvas: HTMLCanvasElement,
  pipelineState: PipelineState,
): void {
  pipelineState.running = false;
  if (pipelineState._intervalId !== null) {
    clearInterval(pipelineState._intervalId);
    pipelineState._intervalId = null;
  }
  updateOverlayResults([]);
  const ctx = overlayCanvas.getContext('2d');
  ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

async function _runPass(
  video: HTMLVideoElement,
  matcherState: MatcherState,
  pipelineState: PipelineState,
): Promise<void> {
  if (!pipelineState.running) return;

  const vw = video.videoWidth  || 640;
  const vh = video.videoHeight || 480;

  // Layer 1: multi-scale detection at native, 1.5×, and 0.75× scales
  const detections = await detectMultiScale(video, {
    scales:       [1.0, 1.5, 0.75],
    minConfidence: 0.5,
  });

  const overlayEntries: OverlayEntry[] = [];
  const seenStudents = new Set<string>();

  for (const det of detections) {
    // Layer 2: crop face and assess quality
    const pad = 0.15;
    const cx  = Math.max(0, det.box.x - det.box.width  * pad);
    const cy  = Math.max(0, det.box.y - det.box.height * pad);
    const cw  = Math.min(vw - cx, det.box.width  * (1 + 2 * pad));
    const ch  = Math.min(vh - cy, det.box.height * (1 + 2 * pad));

    const crop = document.createElement('canvas');
    crop.width  = Math.max(1, Math.round(cw));
    crop.height = Math.max(1, Math.round(ch));
    const cropCtx = crop.getContext('2d');
    if (!cropCtx) continue;
    cropCtx.drawImage(video, cx, cy, cw, ch, 0, 0, crop.width, crop.height);

    const flags = assessPreprocessing(crop);

    // Layer 3: adaptive preprocessing
    applyPreprocessing(crop, { ...flags, needsSharpen: false });

    // Layers 4+5+7: landmark detection, alignment, descriptor extraction
    let faceResult: any;
    try {
      const results = await faceapi
        .detectAllFaces(crop, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      faceResult = results[0] ?? null;
    } catch {
      // Treat pipeline failure as an unknown face
      _addUnknown(det.box, overlayEntries, pipelineState);
      continue;
    }

    if (!faceResult) {
      _addUnknown(det.box, overlayEntries, pipelineState);
      continue;
    }

    const descriptor: Float32Array = faceResult.descriptor;
    const landmarkConf: number     = faceResult.detection?.score ?? 0;

    // Roll angle from eye positions (for quality scoring)
    const leftEye  = (faceResult.landmarks?.getLeftEye?.()  ?? []) as Array<{ x: number; y: number }>;
    const rightEye = (faceResult.landmarks?.getRightEye?.() ?? []) as Array<{ x: number; y: number }>;
    let rollAngle  = 0;
    if (leftEye.length && rightEye.length) {
      const lc = _avg2d(leftEye);
      const rc = _avg2d(rightEye);
      rollAngle = Math.atan2(rc.y - lc.y, rc.x - lc.x) * (180 / Math.PI);
    }

    // Layer 6: quality gate — skip FaceMatcher for poor-quality crops
    const qualityReport = computeQualityReport(
      { width: det.box.width, height: det.box.height },
      det.score,
      landmarkConf,
      vh,
      rollAngle,
      crop,
    );

    if (qualityReport.grade === 'poor') {
      _addUnknown(det.box, overlayEntries, pipelineState);
      continue;
    }

    // Layer 8: matching
    const match = matchDescriptor(matcherState, descriptor);
    if (!match) {
      _addUnknown(det.box, overlayEntries, pipelineState);
      continue;
    }

    // Convert euclidean distance to confidence (1 - dist/threshold)
    const confidence = Math.max(0, Math.min(1, 1 - match.distance / matcherState.threshold));

    if (confidence < 0.3) {
      _addUnknown(det.box, overlayEntries, pipelineState);
      continue;
    }

    // Track confidence for adaptive threshold
    pipelineState._confidenceSamples.push(confidence);
    _checkAdaptive(matcherState, pipelineState);

    // Layer 9: temporal debouncing — 3 consecutive passes to confirm
    seenStudents.add(match.label);
    const { justConfirmed } = recordMatch(matcherState, match.label);
    const confirmed = isConfirmed(matcherState, match.label);

    if (justConfirmed) {
      pipelineState.callbacks.onStudentConfirmed?.(match.label);
    }

    overlayEntries.push({
      box:        det.box,
      label:      match.label,
      confidence,
      confirmed,
      isUnknown:  false,
    });
  }

  // Clear streaks for students not seen this pass
  for (const [id] of matcherState.temporal) {
    if (!seenStudents.has(id)) {
      clearStreak(matcherState, id);
    }
  }

  updateOverlayResults(overlayEntries);
}

function _addUnknown(
  box: { x: number; y: number; width: number; height: number },
  entries: OverlayEntry[],
  state: PipelineState,
): void {
  state.unknownFaceCount++;
  state.callbacks.onUnknownFace?.();
  entries.push({ box, label: 'Unknown', confidence: 0, confirmed: false, isUnknown: true });
}

function _avg2d(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function _checkAdaptive(matcherState: MatcherState, pipelineState: PipelineState): void {
  const samples = pipelineState._confidenceSamples;
  if (samples.length < ADAPTIVE_MIN_SAMPLES || pipelineState.adaptiveThresholdActive) return;

  const avg = samples.reduce((s, c) => s + c, 0) / samples.length;
  if (avg < ADAPTIVE_CONFIDENCE_THRESHOLD) {
    pipelineState.adaptiveThresholdActive = true;
    matcherState.threshold += ADAPTIVE_RELAX_AMOUNT;
    pipelineState.callbacks.onAdaptiveThreshold?.(matcherState.threshold);
  }
}
