/**
 * Application entry point.
 *
 * Boot sequence:
 * 1. Render app shell (header + tab bar + content area + toast container)
 * 2. Check if the URL has an ?enroll= param → show student enrollment form
 * 3. Load CSS
 * 4. Initialize tabs
 * 5. Load face-api models from CDN in the background
 * 6. Register service worker
 */

import '@/styles/main.css';
import { initTabs } from '@/ui/tabs';
import { setState } from '@/state/index';
import { showToast } from '@/ui/toast';

// face-api is loaded from CDN via index.html inline module → window.faceapi.
// Do not reference it directly here; use waitForFaceApi() which polls until ready.
const CDN_MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const LOCAL_MODEL_BASE = '/models';

/**
 * Prefer local models if present (public/models), fall back to CDN otherwise.
 */
async function selectModelBase(): Promise<string> {
  try {
    const res = await fetch(`${LOCAL_MODEL_BASE}/ssd_mobilenetv1_model-weights_manifest.json`, { method: 'HEAD' });
    if (res.ok) return LOCAL_MODEL_BASE;
  } catch (e) {
    // ignore
  }
  return CDN_MODEL_BASE;
}


// ─── Student enrollment landing page (via QR code URL) ───────────────────────

const enrollCode = new URLSearchParams(window.location.search).get('enroll');
if (enrollCode) {
  renderStudentEnrollPage(enrollCode);
} else {
  renderProfessorApp();
}

// ─── Professor app ────────────────────────────────────────────────────────────

function renderProfessorApp(): void {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <header id="app-header" role="banner">
      <h1 class="logo">Changttendance</h1>
      <div id="header-status" style="font-size:.78rem;color:var(--text-muted);">Loading models…</div>
    </header>
    <nav id="tab-bar" role="tablist" aria-label="App navigation"></nav>
    <main id="tab-content" role="main"></main>
    <div id="toast-container" aria-live="polite"></div>
  `;

  initTabs(
    document.getElementById('tab-bar')!,
    document.getElementById('tab-content')!,
  );

  loadModels();
  registerServiceWorker();
}

async function loadModels(): Promise<void> {
  const statusEl = document.getElementById('header-status');

  let faceapi: any;
  // Decide whether to load the real face-api or use a stub (useful for headless E2E).
  // VITE_SKIP_FACEAPI can be set during build/start to force the stub.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skipFaceApi = Boolean((import.meta.env as any).VITE_SKIP_FACEAPI) || Boolean((window as any).__FORCE_SKIP_FACEAPI);
  try {
    if (skipFaceApi) {
      // Minimal stub used for E2E to avoid loading WASM and keep UI logic working.
      // Each `loadFromUri` should resolve so loadModels proceeds.
      (window as any).faceapi = {
        nets: {
          ssdMobilenetv1: { loadFromUri: async () => {} },
          faceLandmark68Net: { loadFromUri: async () => {} },
          faceRecognitionNet: { loadFromUri: async () => {} },
        },
        detectAllFaces: async () => [],
        tf: {
          setBackend: async () => null,
          getBackend: () => 'cpu',
        },
      };
      faceapi = (window as any).faceapi;
    } else {
      // Dynamically import CDN module and expose as window.faceapi so the rest of the
      // app can reference it via waitForFaceApi() if needed.
      try {
        // Fetch the ESM module at runtime and import via a blob URL. This prevents
        // the bundler from statically inlining the CDN import which would cause
        // the module to be requested even when the app wants to skip it.
        const cdnUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.esm.js';
        const resp = await fetch(cdnUrl);
        if (!resp.ok) throw new Error(`Failed to fetch face-api from CDN: ${resp.status}`);
        const text = await resp.text();
        const blob = new Blob([text], { type: 'text/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
          const mod = await import(blobUrl);
          (window as any).faceapi = mod;
          faceapi = mod;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (statusEl) statusEl.textContent = 'face-api load failed';
        showToast(`Failed to load face-api module: ${msg}`, 'error', 10_000);
        return;
      }
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (statusEl) statusEl.textContent = 'face-api load failed';
    showToast(msg, 'error', 10_000);
    return;
  }

  try {
    // Initialise TF.js backend (WebGL → WASM → CPU fallback handled by face-api)
    // Allow forcing backend during E2E / CI via VITE_FORCE_TF_BACKEND
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forcedBackend = (import.meta.env as any).VITE_FORCE_TF_BACKEND as string | undefined;
    if (forcedBackend) {
      // eslint-disable-next-line no-console
      console.log('[main] Forcing TF backend to', forcedBackend);
      await faceapi.tf?.setBackend?.(forcedBackend).catch?.(() => null);
    } else {
      await faceapi.tf?.setBackend?.('webgl').catch?.(() => null);
    }
    const backend: string = faceapi.tf?.getBackend?.() ?? 'cpu';
    setState({ tfBackend: backend as any });

    if (backend !== 'webgl') {
      showToast(
        `GPU acceleration unavailable — running on ${backend.toUpperCase()}. ` +
        'Recognition will be slower.',
        'warning',
        8000,
      );
    }

    if (statusEl) statusEl.textContent = 'Loading models…';

    const MODEL_BASE = await selectModelBase();
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_BASE),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE),
    ]);

    setState({ modelsLoaded: true });
    if (statusEl) statusEl.textContent = `${backend.toUpperCase()} · Models ready`;
  } catch (e) {
    const msg = (e as Error).message;
    if (statusEl) statusEl.textContent = 'Model load failed';
    showToast(
      `Models failed to load: ${msg}. ` +
      'Check your internet connection and refresh. Models are cached after first load.',
      'error',
      10_000,
    );
  }
}

// ─── Student enrollment landing page ─────────────────────────────────────────

function renderStudentEnrollPage(enrollCode: string): void {
  const root = document.getElementById('app');
  if (!root) return;

  document.title = 'Enroll — Changttendance';

  root.innerHTML = `
    <div style="max-width:480px;margin:32px auto;padding:20px;">
      <h1 style="margin-bottom:4px;">Student Enrollment</h1>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:24px;">
        Powered by Changttendance · East Stroudsburg University
      </p>
      <div id="enroll-form"></div>
    </div>
    <div id="toast-container" aria-live="polite"></div>
  `;

  renderRemoteEnrollForm(enrollCode, document.getElementById('enroll-form')!);
}

function renderRemoteEnrollForm(enrollCode: string, container: HTMLElement): void {
  // Form is self-contained — full app modules are not loaded on the student page

  container.innerHTML = `
    <div style="display:grid;gap:14px;">
      <div class="field">
        <label>Full name <span style="color:var(--danger)">*</span></label>
        <input id="re-name" class="input" placeholder="Jane Smith" autocomplete="name" required>
      </div>
      <div class="field">
        <label>Student ID <span style="color:var(--danger)">*</span></label>
        <input id="re-sid" class="input" placeholder="E12345678" required>
      </div>
      <div class="field">
        <label>Email (optional)</label>
        <input id="re-email" class="input" type="email" placeholder="you@esu.edu">
      </div>
      <div class="card" style="margin-top:4px;">
        <label class="checkbox-row">
          <input id="re-consent" type="checkbox" required>
          <span style="font-size:.8rem;color:var(--text-muted);">
            By submitting this form I consent to having my facial features analyzed by software
            running on my professor's computer to verify my attendance. My photo will be used only
            to create a mathematical representation of my face and will be permanently deleted
            immediately after processing. No photo of me will be stored anywhere. I can request
            deletion of my data at any time by contacting my professor.
          </span>
        </label>
      </div>
      <div class="field">
        <label>Photo <span style="color:var(--danger)">*</span></label>
        <div id="re-camera-wrap" class="camera-placeholder">
          <p>Tap to open camera</p>
        </div>
        <p id="re-quality-msg" style="font-size:.8rem;color:var(--text-muted);margin-top:4px;"></p>
      </div>
      <button id="re-submit" class="btn btn-primary btn-full" disabled>Submit Enrollment</button>
      <div id="re-status"></div>
    </div>
  `;

  const cameraWrap = document.getElementById('re-camera-wrap')!;
  const submitBtn  = document.getElementById('re-submit') as HTMLButtonElement;
  const statusDiv  = document.getElementById('re-status')!;
  const qualityMsg = document.getElementById('re-quality-msg')!;

  let capturedPhoto: Blob | null = null;
  let video: HTMLVideoElement | null = null;

  cameraWrap.addEventListener('click', async () => {
    cameraWrap.innerHTML = '<span class="spinner"></span>';

    video = document.createElement('video');
    video.autoplay = true;
    video.muted    = true;
    video.playsInline = true;
    video.style.cssText = 'width:100%;border-radius:8px;';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();
      cameraWrap.className = '';
      cameraWrap.style.cssText = 'position:relative;';
      cameraWrap.innerHTML  = '';
      cameraWrap.appendChild(video);

      const captureBtn = document.createElement('button');
      captureBtn.className   = 'btn btn-primary btn-full';
      captureBtn.style.marginTop = '8px';
      captureBtn.textContent = 'Take Photo';
      captureBtn.addEventListener('click', async () => {
        const canvas = document.createElement('canvas');
        canvas.width  = video!.videoWidth  || 640;
        canvas.height = video!.videoHeight || 480;
        canvas.getContext('2d')?.drawImage(video!, 0, 0);
        capturedPhoto = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), 'image/jpeg', 0.85),
        );
        if (capturedPhoto) {
          qualityMsg.textContent = 'Photo captured — review before submitting.';
          submitBtn.disabled = false;
        }
      });
      cameraWrap.appendChild(captureBtn);
    } catch (e) {
      cameraWrap.className = 'camera-placeholder';
      cameraWrap.innerHTML = `<p style="color:var(--danger)">${(e as Error).message}</p>`;
    }
  });

  submitBtn.addEventListener('click', async () => {
    const name  = (document.getElementById('re-name') as HTMLInputElement).value.trim();
    const sid   = (document.getElementById('re-sid')  as HTMLInputElement).value.trim();
    const email = (document.getElementById('re-email') as HTMLInputElement).value.trim();
    const consent = (document.getElementById('re-consent') as HTMLInputElement).checked;

    if (!name || !sid) { showToast('Name and student ID are required.', 'warning'); return; }
    if (!consent)       { showToast('You must consent to proceed.', 'warning'); return; }
    if (!capturedPhoto) { showToast('Take a photo first.', 'warning'); return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Submitting…';

    // The student page uses Supabase directly via env vars baked at build time
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      statusDiv.innerHTML = `<div class="banner banner-danger">Online enrollment is not configured for this deployment. Please enroll in person with your professor.</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Enrollment';
      return;
    }

    const { getProvider: gp } = await import('@/provider/index');
    const result = await gp().submitEnrollment(name, sid, email || null, enrollCode, capturedPhoto);

    if (!result.ok) {
      statusDiv.innerHTML = `<div class="banner banner-danger">Submission failed: ${result.error}. Please try again or contact your professor.</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Enrollment';
      return;
    }

    statusDiv.innerHTML = `
      <div class="banner banner-success">
        Enrollment submitted successfully! Your professor will review and approve your enrollment
        before the first class. Your photo will be deleted immediately after processing.
      </div>
    `;
    submitBtn.style.display = 'none';

    // Stop camera
    if (video?.srcObject) {
      const tracks = (video.srcObject as MediaStream).getTracks();
      for (let i = 0; i < tracks.length; i++) tracks[i]!.stop();
    }
  });
}

// ─── Service worker ───────────────────────────────────────────────────────────

function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((e) => {
        console.warn('Service worker registration failed:', e);
      });
    });
  }
}
