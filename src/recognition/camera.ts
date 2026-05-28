/**
 * Camera device management and getUserMedia initialization.
 *
 * Safari desktop quirk: facingMode constraint causes OverconstrainedError on
 * laptop webcams — it is omitted on Safari.
 * iOS 16+: camera permission must be triggered from a direct user gesture.
 * USB webcam enumeration requires an active stream first for labeled device names.
 */

export interface CameraDevice {
  deviceId: string;
  label: string;
}

let _activeStream: MediaStream | null = null;

/**
 * Enumerate available video input devices.
 * Browser only provides labels after permission has been granted.
 * Call after openCamera() for best results.
 */
export async function listCameraDevices(): Promise<CameraDevice[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
  } catch {
    return [];
  }
}

/**
 * Open a camera stream on the given video element.
 * Closes any previously active stream first.
 *
 * @param videoEl - The <video> element to receive the stream
 * @param deviceId - Optional specific camera device ID
 */
export async function openCamera(
  videoEl: HTMLVideoElement,
  deviceId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  closeCamera();

  const isSafariDesktop =
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
    !/iPhone|iPad|iPod/.test(navigator.userAgent);

  const constraints: MediaTrackConstraints = {
    width:  { ideal: 1280 },
    height: { ideal: 720 },
  };

  // facingMode causes OverconstrainedError on Safari desktop laptop webcams
  if (!isSafariDesktop) {
    constraints.facingMode = 'user';
  }

  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: constraints,
      audio: false,
    });

    _activeStream = stream;
    videoEl.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Video element failed'));
    });

    await videoEl.play();
    return { ok: true };
  } catch (e) {
    _activeStream = null;
    const err = e as DOMException;

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return {
        ok: false,
        error:
          'Camera access denied. Go to browser Settings → Site Permissions → Camera, ' +
          'allow access for this site, then refresh the page.',
      };
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return { ok: false, error: 'No camera found. Connect a webcam and refresh.' };
    }
    if (err.name === 'OverconstrainedError' && deviceId) {
      // Device constraint failed — retry without specific device
      return openCamera(videoEl, null);
    }

    return { ok: false, error: `Camera error: ${err.message || err.name}` };
  }
}

/** Stop all tracks and release the camera device. */
export function closeCamera(): void {
  if (_activeStream) {
    const tracks = _activeStream.getTracks();
    for (let i = 0; i < tracks.length; i++) tracks[i]!.stop();
    _activeStream = null;
  }
}

/** True if a stream is currently open and active. */
export function isCameraOpen(): boolean {
  return _activeStream !== null && _activeStream.active;
}

/**
 * Capture a single frame from the video element to a canvas.
 * Returns an offscreen canvas at the video's native resolution.
 */
export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(video, 0, 0);
  return canvas;
}
