/**
 * Canvas overlay for drawing recognition results on top of the live video.
 * Runs at 60fps via requestAnimationFrame — decoupled from the 1-second detection loop.
 * No blocking operations here; just reads the latest results and paints them.
 */

import type { FaceQualityGrade } from '@/types/index';

// ESU design system colors
const COLOR_CONFIRMED = '#C8A84B'; // ESU gold — confirmed match
const COLOR_LOW_CONF  = '#D4A017'; // amber — low confidence / pending confirmation
const COLOR_UNKNOWN   = '#5A5A4A'; // dark charcoal — unrecognized face

const LINE_WIDTH = 2.5;
const LABEL_FONT = '13px "DM Mono", monospace';
const LABEL_PAD  = 6;
const LABEL_H    = 22;

export interface OverlayEntry {
  box: { x: number; y: number; width: number; height: number };
  /** Student ID for confirmed, partial name for pending, 'Unknown' for unknown */
  label: string;
  /** Combined confidence 0–1 */
  confidence: number;
  /** True once 3 consecutive passes confirm this student */
  confirmed: boolean;
  isUnknown: boolean;
}

let _rafId: number | null = null;
let _latestResults: OverlayEntry[] = [];

/** Push new results to be drawn on the next animation frame. */
export function updateOverlayResults(results: OverlayEntry[]): void {
  _latestResults = results;
}

/** Start the 60fps overlay loop. Safe to call multiple times — only one loop runs. */
export function startOverlayLoop(
  overlayCanvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  if (_rafId !== null) return;

  function draw() {
    const ctx = overlayCanvas.getContext('2d');
    if (ctx) {
      // Sync canvas dimensions to video without triggering layout
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      if (overlayCanvas.width !== vw) overlayCanvas.width = vw;
      if (overlayCanvas.height !== vh) overlayCanvas.height = vh;

      ctx.clearRect(0, 0, vw, vh);
      for (const result of _latestResults) {
        drawEntry(ctx, result);
      }
    }
    _rafId = requestAnimationFrame(draw);
  }

  _rafId = requestAnimationFrame(draw);
}

/** Stop the overlay loop and clear the canvas. */
export function stopOverlayLoop(overlayCanvas: HTMLCanvasElement): void {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _latestResults = [];
  const ctx = overlayCanvas.getContext('2d');
  ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function drawEntry(ctx: CanvasRenderingContext2D, entry: OverlayEntry): void {
  const { box, label, confidence, confirmed, isUnknown } = entry;
  const color = isUnknown ? COLOR_UNKNOWN : confirmed ? COLOR_CONFIRMED : COLOR_LOW_CONF;
  const pct   = Math.round(confidence * 100);

  // Bounding box with optional glow for confirmed matches
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = LINE_WIDTH;
  if (confirmed) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
  }
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.shadowBlur = 0;

  // Label text
  const text = isUnknown
    ? 'Unknown'
    : confirmed
      ? `${label} · ${pct}%`
      : `${label}? · ${pct}%`;

  ctx.font = LABEL_FONT;
  const textW = ctx.measureText(text).width;
  const bgW   = textW + LABEL_PAD * 2;
  const labelY = box.y >= LABEL_H + 4 ? box.y - LABEL_H - 2 : box.y + box.height + 4;

  ctx.fillStyle = color;
  ctx.fillRect(box.x, labelY, bgW, LABEL_H);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillText(text, box.x + LABEL_PAD, labelY + 15);
  ctx.restore();
}

/**
 * Draw a quality ring around a detected face during enrollment.
 * Called from the enrollment flow at 500ms intervals.
 */
export function drawEnrollmentRing(
  canvas: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number },
  grade: FaceQualityGrade | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!box) return;

  const color =
    grade === 'excellent' || grade === 'good'
      ? '#2E7D52'
      : grade === 'acceptable'
        ? '#D4A017'
        : '#C0392B';

  const cx = box.x + box.width  / 2;
  const cy = box.y + box.height / 2;
  const r  = Math.max(box.width, box.height) / 2 + 12;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (grade) {
    ctx.font      = '12px "DM Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(grade.toUpperCase(), cx, cy + r + 18);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
