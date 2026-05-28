/* Multi-scale detection and non-maximum suppression for the recognition pipeline.
 * Produces DetectionLayerResult objects in video coordinate space.
 */

import type { DetectionLayerResult } from '@/types/index';


/** Draw the current video frame into a temp canvas at the requested scale. */
function drawVideoToCanvas(video: HTMLVideoElement, scale: number): HTMLCanvasElement {
  const vw = video.videoWidth || video.clientWidth || 640;
  const vh = video.videoHeight || video.clientHeight || 480;
  const sw = Math.max(1, Math.round(vw * scale));
  const sh = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(video, 0, 0, sw, sh);
  return canvas;
}

/** Compute IoU between two boxes in x,y,w,h format. */
function iou(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;
  return union === 0 ? 0 : inter / union;
}

/** Non-maximum suppression: keep highest-score boxes and remove overlaps above threshold. */
export function nonMaxSuppression(boxes: DetectionLayerResult[], iouThreshold = 0.45): DetectionLayerResult[] {
  const copy = boxes.slice().sort((a, b) => b.score - a.score);
  const kept: DetectionLayerResult[] = [];

  while (copy.length > 0) {
    const current = copy.shift()!;
    kept.push(current);
    for (let i = copy.length - 1; i >= 0; i--) {
      const c = copy[i];
      if (iou(current.box, c.box) > iouThreshold) {
        copy.splice(i, 1);
      }
    }
  }

  return kept;
}

/**
 * Run SSD MobileNet detection at multiple scales and merge results via NMS.
 * Returns bounding boxes in the original video coordinate space.
 */
export async function detectMultiScale(
  video: HTMLVideoElement,
  options?: { scales?: number[]; minConfidence?: number; iouThreshold?: number }
): Promise<DetectionLayerResult[]> {
  const scales = options?.scales ?? [1.0, 0.75, 0.5];
  const minConfidence = options?.minConfidence ?? 0.5;
  const iouThreshold = options?.iouThreshold ?? 0.45;

  const allDetections: DetectionLayerResult[] = [];

  for (const scale of scales) {
    const canvas = drawVideoToCanvas(video, scale);

    // Use faceapi to detect faces on the scaled canvas.
    // `detectAllFaces` returns objects with `.box` and `.score`.
    let detections: any[] = [];
    try {
      // Prefer explicit options if available on the loaded face-api build
      if (faceapi?.SsdMobilenetv1Options) {
        detections = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence }));
      } else {
        detections = await faceapi.detectAllFaces(canvas);
      }
    } catch (e) {
      // In case faceapi isn't ready or throws, return empty
      console.warn('face-api detect error:', e);
      continue;
    }

    for (const d of detections) {
      const box = (d.box && typeof d.box.x === 'number')
        ? { x: d.box.x / scale, y: d.box.y / scale, width: d.box.width / scale, height: d.box.height / scale }
        : null;
      const score = typeof d.score === 'number' ? d.score : (d.detectionScore ?? 0);
      if (!box) continue;
      if (score < minConfidence) continue;

      allDetections.push({ box, score, scale });
    }
  }

  // Merge overlapping detections with NMS
  const merged = nonMaxSuppression(allDetections, iouThreshold);

  // Convert to DetectionLayerResult[] (already matches type)
  return merged.map((m) => ({ box: m.box, score: m.score, scale: m.scale } as DetectionLayerResult));
}
