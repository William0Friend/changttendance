import { computeAverageLuminance, assessPreprocessing } from '../../src/recognition/preprocess';

describe('preprocess utilities', () => {
  test('computeAverageLuminance calculates expected average for white+black pixels', () => {
    const width = 2;
    const height = 1;
    // White pixel (255,255,255,255) and black pixel (0,0,0,255)
    const data = new Uint8ClampedArray([255,255,255,255, 0,0,0,255]);
    const ctx = { getImageData: () => ({ data }) } as any;
    const canvas = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;

    const avg = computeAverageLuminance(canvas);
    expect(avg).toBeCloseTo(127.5, 1);
  });

  test('assessPreprocessing flags dark image for equalization', () => {
    const width = 1;
    const height = 1;
    const data = new Uint8ClampedArray([10,10,10,255]);
    const ctx = { getImageData: () => ({ data }) } as any;
    const canvas = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;

    const flags = assessPreprocessing(canvas);
    expect(flags.needsEq).toBe(true);
  });
});
