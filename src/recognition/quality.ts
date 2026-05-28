import type { FaceQualityReport, FaceQualityGrade } from '@/types/index';

// Thresholds for each quality dimension
const DETECTION_SCORE_MIN  = 0.7;
const LANDMARK_CONF_MIN    = 0.6;
const SHARPNESS_MIN        = 50;
const BRIGHTNESS_MIN       = 60;
const BRIGHTNESS_MAX       = 200;
const FACE_SIZE_RATIO_MIN  = 0.12; // face height / frame height
const HEAD_ANGLE_MAX       = 25;   // degrees of roll

/** Compute average luminance (brightness) across a canvas. */
export function computeLuminance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 128;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / pixels;
}

/**
 * Estimate image sharpness via Laplacian variance approximation.
 * Higher variance = sharper image.
 */
export function computeSharpness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  // Convert to grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const px = i * 4;
    gray[i] = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
  }

  // Apply 3x3 Laplacian kernel: [0,1,0],[1,-4,1],[0,1,0]
  let variance = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        (gray[idx - width] ?? 0) +
        (gray[idx + width] ?? 0) +
        (gray[idx - 1]     ?? 0) +
        (gray[idx + 1]     ?? 0) -
        4 * (gray[idx]     ?? 0);
      variance += lap * lap;
      count++;
    }
  }

  return count > 0 ? variance / count : 0;
}

/**
 * Compute a complete quality report for a detected face.
 *
 * @param box - Bounding box in video coordinates
 * @param detectionScore - SSD detection confidence 0–1
 * @param landmarkConfidence - Fraction of reliable landmarks 0–1
 * @param frameHeight - Height of the source video frame in pixels
 * @param rollAngleDeg - Head roll angle in degrees (from alignment step)
 * @param alignedCrop - The aligned face crop canvas (for sharpness + brightness)
 */
export function computeQualityReport(
  box: { width: number; height: number },
  detectionScore: number,
  landmarkConfidence: number,
  frameHeight: number,
  rollAngleDeg: number,
  alignedCrop: HTMLCanvasElement,
): FaceQualityReport {
  const sharpness  = computeSharpness(alignedCrop);
  const brightness = computeLuminance(alignedCrop);
  const faceSizeRatio = box.height / frameHeight;

  const failedChecks: string[] = [];

  if (detectionScore < DETECTION_SCORE_MIN)   failedChecks.push('detectionScore');
  if (landmarkConfidence < LANDMARK_CONF_MIN) failedChecks.push('landmarkConfidence');
  if (sharpness < SHARPNESS_MIN)              failedChecks.push('sharpness');
  if (brightness < BRIGHTNESS_MIN)            failedChecks.push('brightnessTooLow');
  if (brightness > BRIGHTNESS_MAX)            failedChecks.push('brightnessTooHigh');
  if (faceSizeRatio < FACE_SIZE_RATIO_MIN)    failedChecks.push('faceTooSmall');
  if (Math.abs(rollAngleDeg) > HEAD_ANGLE_MAX) failedChecks.push('headAngle');

  const passed = 7 - failedChecks.length;

  let grade: FaceQualityGrade;
  if (passed === 7 && detectionScore > 0.9) {
    grade = 'excellent' as FaceQualityGrade;
  } else if (passed === 7) {
    grade = 'good' as FaceQualityGrade;
  } else if (passed >= 6) {
    grade = 'acceptable' as FaceQualityGrade;
  } else {
    grade = 'poor' as FaceQualityGrade;
  }

  return {
    detectionScore,
    landmarkConfidence,
    sharpness,
    brightness,
    faceSizeRatio,
    headAngle: rollAngleDeg,
    grade,
    failedChecks,
  };
}

/** Returns a specific, actionable rejection message for enrollment quality failures. */
export function getEnrollmentRejectionMessage(report: FaceQualityReport): string {
  const checks = report.failedChecks;

  if (checks.includes('faceTooSmall')) {
    return 'Move closer to the camera — face is too small in frame.';
  }
  if (checks.includes('brightnessTooLow')) {
    return 'Too dark — move to a brighter area or turn on a light.';
  }
  if (checks.includes('brightnessTooHigh')) {
    return 'Too bright — avoid direct backlighting or bright windows behind you.';
  }
  if (checks.includes('sharpness')) {
    return 'Image is blurry — hold still and ensure the camera is focused.';
  }
  if (checks.includes('headAngle')) {
    return 'Head is tilted too much — look straight at the camera.';
  }
  if (checks.includes('landmarkConfidence')) {
    return 'Face landmarks unclear — remove hat or glasses if possible, and face the camera directly.';
  }
  if (checks.includes('detectionScore')) {
    return 'Face not detected clearly — ensure face is fully visible and well-lit.';
  }

  return 'Image quality too low for enrollment — try again in better lighting.';
}
