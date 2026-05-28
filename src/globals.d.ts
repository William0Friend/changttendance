/**
 * Ambient global declarations for CDN-loaded libraries.
 *
 * face-api (@vladmandic/face-api) is loaded as an ESM module from cdn.jsdelivr.net
 * via the inline <script type="module"> in index.html, which assigns it to window.faceapi.
 * TypeScript sees the bare `faceapi` identifier via this ambient declaration.
 *
 * QRCode (qrcodejs) is loaded as a UMD script from CDN in index.html.
 */

interface FaceApiGlobal {
  tf?: {
    setBackend(name: string): Promise<void>;
    getBackend(): string;
  };
  nets: {
    ssdMobilenetv1:    { loadFromUri(uri: string): Promise<void> };
    faceLandmark68Net: { loadFromUri(uri: string): Promise<void> };
    faceRecognitionNet:{ loadFromUri(uri: string): Promise<void> };
  };
  LabeledFaceDescriptors: new (label: string, descriptors: Float32Array[]) => unknown;
  FaceMatcher: new (
    descriptors: unknown[],
    threshold: number,
  ) => { findBestMatch(d: Float32Array): { label: string; distance: number } };
  // Detection API (used in layers.ts, enrollment.ts, pipeline.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// eslint-disable-next-line no-var
declare var faceapi: FaceApiGlobal;

interface QRCodeOptions {
  text:            string;
  width?:          number;
  height?:         number;
  colorDark?:      string;
  colorLight?:     string;
  correctLevel?:   number;
}

declare class QRCode {
  constructor(el: HTMLElement, opts: QRCodeOptions | string);
  clear(): void;
  makeCode(text: string): void;
  static CorrectLevel: { L: number; M: number; Q: number; H: number };
}
