/**
 * In-person enrollment capture flow.
 * Runs the full 9-layer pipeline on each capture attempt.
 * Minimum 3 captures at Acceptable quality or better before saving.
 *
 * INVARIANT: No image data is stored anywhere. Only Float32Array descriptors
 * are returned, and intermediate canvases are immediately GC'd.
 */

import type { FaceDescriptor, FaceQualityReport } from '@/types/index';
import { assessPreprocessing, applyPreprocessing } from './preprocess';
import { computeQualityReport, getEnrollmentRejectionMessage } from './quality';
import { detectMultiScale } from './layers';


export const MIN_CAPTURES = 3;
export const MAX_CAPTURES = 5;

export interface CaptureResult {
  descriptor: FaceDescriptor;
  quality: FaceQualityReport;
  preprocessingApplied: string[];
}

export interface EnrollmentSession {
  captures: CaptureResult[];
}

export function createEnrollmentSession(): EnrollmentSession {
  return { captures: [] };
}

export function canSave(session: EnrollmentSession): boolean {
  return session.captures.length >= MIN_CAPTURES;
}

export function canCapture(session: EnrollmentSession): boolean {
  return session.captures.length < MAX_CAPTURES;
}

/**
 * Attempt a single enrollment capture from the active video element.
 * Returns a CaptureResult on success, or a user-facing rejection message on failure.
 */
export async function attemptCapture(
  video: HTMLVideoElement,
): Promise<CaptureResult | string> {
  const vw = video.videoWidth  || 640;
  const vh = video.videoHeight || 480;

  // Layer 1: multi-scale face detection
  const detections = await detectMultiScale(video, { minConfidence: 0.5 });

  if (detections.length === 0) {
    return 'No face detected — center your face in the frame and look at the camera.';
  }
  if (detections.length > 1) {
    return 'Multiple faces visible — make sure only your face is in frame.';
  }

  const det = detections[0]!;

  // Crop face region with 20% padding for landmark detection
  const pad = 0.2;
  const cx  = Math.max(0, det.box.x - det.box.width  * pad);
  const cy  = Math.max(0, det.box.y - det.box.height * pad);
  const cw  = Math.min(vw - cx, det.box.width  * (1 + 2 * pad));
  const ch  = Math.min(vh - cy, det.box.height * (1 + 2 * pad));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width  = Math.max(1, Math.round(cw));
  cropCanvas.height = Math.max(1, Math.round(ch));
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return 'Canvas unavailable — refresh and try again.';
  cropCtx.drawImage(video, cx, cy, cw, ch, 0, 0, cropCanvas.width, cropCanvas.height);

  // Layer 2: assess preprocessing needs
  const flags = assessPreprocessing(cropCanvas);

  // Layer 3: apply adaptive preprocessing
  const preprocessingApplied = applyPreprocessing(cropCanvas, { ...flags, needsSharpen: false });

  // Layers 4+5+7: landmark detection, alignment, descriptor extraction via face-api
  let faceResult: any;
  try {
    const results = await faceapi
      .detectAllFaces(cropCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    faceResult = results[0] ?? null;
  } catch (e) {
    return `Face analysis failed — ${(e as Error).message}. Check your internet connection (models load from CDN on first use).`;
  }

  if (!faceResult) {
    return 'Face not detected after preprocessing — adjust your lighting and try again.';
  }

  const descriptor: FaceDescriptor = faceResult.descriptor as Float32Array;
  const landmarkConf: number       = faceResult.detection?.score ?? 0;

  // Compute roll angle from eye landmark positions for quality scoring
  const leftEye  = (faceResult.landmarks?.getLeftEye?.()  ?? []) as Array<{ x: number; y: number }>;
  const rightEye = (faceResult.landmarks?.getRightEye?.() ?? []) as Array<{ x: number; y: number }>;
  let rollAngle = 0;
  if (leftEye.length && rightEye.length) {
    const lc = eyeCenter(leftEye);
    const rc = eyeCenter(rightEye);
    rollAngle = Math.atan2(rc.y - lc.y, rc.x - lc.x) * (180 / Math.PI);
  }

  // Layer 6: quality scoring on the aligned crop
  const quality = computeQualityReport(
    { width: det.box.width, height: det.box.height },
    det.score,
    landmarkConf,
    vh,
    rollAngle,
    cropCanvas,
  );

  if (quality.grade === 'poor') {
    return getEnrollmentRejectionMessage(quality);
  }

  return { descriptor, quality, preprocessingApplied };
}

function eyeCenter(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}
