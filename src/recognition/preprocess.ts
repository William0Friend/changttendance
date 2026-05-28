/**
 * Canvas-based image preprocessing for face recognition.
 * All operations mutate the canvas in-place.
 * No images are stored — canvases are transient and discarded after use.
 */

export interface PreprocessFlags {
  needsEq: boolean;       // luminance < 80 or > 210
  needsClahe: boolean;    // dark AND high local contrast
  needsSharpen: boolean;  // sharpness < 50
  needsWarmCorrect: boolean; // red channel > blue channel + 20
}

/** Compute average luminance of a canvas (0–255). */
export function computeAverageLuminance(canvas: HTMLCanvasElement): number {
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

/** Assess which preprocessing steps are needed for the given canvas. */
export function assessPreprocessing(canvas: HTMLCanvasElement): PreprocessFlags {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { needsEq: false, needsClahe: false, needsSharpen: false, needsWarmCorrect: false };

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = data.length / 4;

  let lumSum = 0;
  let rSum = 0;
  let bSum = 0;
  let localVariance = 0;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lumSum += lum;
    rSum += data[i];
    bSum += data[i + 2];
  }

  const avgLum = lumSum / pixels;
  const avgR = rSum / pixels;
  const avgB = bSum / pixels;

  // Sample variance for CLAHE decision
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    localVariance += (lum - avgLum) ** 2;
  }
  localVariance /= pixels;

  return {
    needsEq: avgLum < 80 || avgLum > 210,
    needsClahe: avgLum < 60 && localVariance > 1500,
    needsSharpen: false, // determined after sharpness computation in quality.ts
    needsWarmCorrect: avgR > avgB + 20,
  };
}

/** Redistribute pixel values across full 0–255 luminance range. */
export function histogramEqualization(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const total = canvas.width * canvas.height;

  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }

  const cdf = new Array<number>(256).fill(0);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
  const cdfMin = cdf.find((v) => v > 0) ?? 0;

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(((cdf[i] - cdfMin) / (total - cdfMin)) * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const scale = lum > 0 ? (lut[lum] ?? 0) / lum : 1;
    data[i]     = Math.min(255, data[i]     * scale);
    data[i + 1] = Math.min(255, data[i + 1] * scale);
    data[i + 2] = Math.min(255, data[i + 2] * scale);
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Tile-based adaptive histogram equalization.
 * Divides image into a grid and equalizes each tile independently,
 * then interpolates at boundaries to avoid block artifacts.
 * Prevents the global over-brightening that full histogram eq causes in high-contrast scenes.
 */
export function claheApproximation(canvas: HTMLCanvasElement, gridSize = 8): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const tileW = Math.ceil(W / gridSize);
  const tileH = Math.ceil(H / gridSize);
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  // Build per-tile LUTs
  const luts: Uint8Array[][] = [];
  for (let gy = 0; gy < gridSize; gy++) {
    luts[gy] = [];
    for (let gx = 0; gx < gridSize; gx++) {
      const x0 = gx * tileW;
      const y0 = gy * tileH;
      const x1 = Math.min(x0 + tileW, W);
      const y1 = Math.min(y0 + tileH, H);

      const hist = new Array<number>(256).fill(0);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * W + x) * 4;
          const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
          hist[lum]++;
          count++;
        }
      }

      // Clip limit: 4x average bin height
      const clipLimit = Math.max(1, Math.floor((4 * count) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipLimit) {
          excess += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }
      // Redistribute excess uniformly
      const perBin = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) hist[i] += perBin;

      const cdf = new Array<number>(256).fill(0);
      cdf[0] = hist[0];
      for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
      const cdfMin = cdf.find((v) => v > 0) ?? 0;

      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        lut[i] = Math.round(((cdf[i] - cdfMin) / (count - cdfMin)) * 255);
      }
      luts[gy][gx] = lut;
    }
  }

  // Apply with bilinear interpolation between tile LUTs
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      if (lum === 0) continue;

      const gx = Math.min(gridSize - 1, Math.floor(x / tileW));
      const gy = Math.min(gridSize - 1, Math.floor(y / tileH));

      const newLum = (luts[gy]?.[gx]?.[lum]) ?? lum;
      const scale = newLum / lum;
      data[idx]     = Math.min(255, data[idx]     * scale);
      data[idx + 1] = Math.min(255, data[idx + 1] * scale);
      data[idx + 2] = Math.min(255, data[idx + 2] * scale);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Unsharp mask sharpening.
 * Creates a blurred version, then adds scaled difference back to original.
 */
export function unsharpMask(canvas: HTMLCanvasElement, amount = 0.8): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Create blurred copy using a temporary canvas
  const blurred = document.createElement('canvas');
  blurred.width = canvas.width;
  blurred.height = canvas.height;
  const bctx = blurred.getContext('2d');
  if (!bctx) return;
  bctx.filter = 'blur(2px)';
  bctx.drawImage(canvas, 0, 0);

  const orig = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const blur = bctx.getImageData(0, 0, canvas.width, canvas.height);
  const out  = ctx.createImageData(canvas.width, canvas.height);

  for (let i = 0; i < orig.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = orig.data[i + c];
      const b = blur.data[i + c];
      out.data[i + c] = Math.max(0, Math.min(255, o + amount * (o - b)));
    }
    out.data[i + 3] = 255;
  }

  ctx.putImageData(out, 0, 0);
}

/**
 * Mild warm-color correction for fluorescent lighting.
 * Boosts red slightly, reduces green slightly to counteract yellow-green cast.
 */
export function warmCorrection(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.min(255, data[i]     * 1.05); // slight red boost
    data[i + 1] = Math.max(0,   data[i + 1] * 0.97); // slight green reduce
    // blue unchanged
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Orchestrates preprocessing steps based on assessed flags.
 * Returns list of step names that were applied (for logging in AttendanceRecord).
 */
export function applyPreprocessing(
  canvas: HTMLCanvasElement,
  flags: PreprocessFlags & { needsSharpen: boolean },
): string[] {
  const applied: string[] = [];

  if (flags.needsClahe) {
    claheApproximation(canvas);
    applied.push('clahe');
  } else if (flags.needsEq) {
    histogramEqualization(canvas);
    applied.push('histogramEq');
  }

  if (flags.needsSharpen) {
    unsharpMask(canvas);
    applied.push('sharpen');
  }

  if (flags.needsWarmCorrect) {
    warmCorrection(canvas);
    applied.push('warmCorrect');
  }

  return applied;
}
