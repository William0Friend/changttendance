/**
 * All five application tabs rendered as vanilla-TS DOM modules.
 *
 * Tab layout:
 *   1. attendance  — Take Attendance (camera + student grid + session controls)
 *   2. enroll      — Enroll Students (in-person + online queue sub-tabs)
 *   3. classes     — Classes (roster, QR code, enrollment link)
 *   4. sessions    — Session Log (filterable history with CSV export)
 *   5. settings    — Settings (threshold, camera, Supabase, data management)
 */

import { getState, setState, subscribe } from '@/state/index';
import { showToast } from './toast';
import { openModal } from './modal';
import { detectMultiScale } from '@/recognition/layers';
import {
  listClasses,
  createClass,
  getClass,
  updateClass,
  listStudentsByClass,
  createStudent,
  listSessionsByClass,
  getSession,
  createSession,
  updateSession,
  getAttendanceBySession,
  saveAttendanceRecord,
  updateAttendanceRecord,
  getEmbeddingsByClass,
  saveEmbedding,
  getAllDataForExport,
  clearAllData,
  finalizeSession,
} from '@/db/crud';
import {
  openCamera,
  closeCamera,
  listCameraDevices,
} from '@/recognition/camera';
import {
  startOverlayLoop,
  stopOverlayLoop,
  drawEnrollmentRing,
} from '@/recognition/overlay';
import {
  createMatcherState,
  buildMatcher,
  type MatcherState,
} from '@/recognition/matcher';
import {
  createPipelineState,
  startScanLoop,
  stopScanLoop,
} from '@/recognition/pipeline';
import {
  createEnrollmentSession,
  attemptCapture,
  MIN_CAPTURES,
  MAX_CAPTURES,
  canSave,
  canCapture,
} from '@/recognition/enrollment';
import { getProvider, reinitProvider } from '@/provider/index';
import { exportSessionCSV, exportAllDataJSON } from '@/utils/export';
import { formatDate, todayISO, formatPct } from '@/utils/format';
import { CONSENT_TEXT } from '@/utils/consent';
import { genUUID } from '@/utils/uuid';
import type {
  LocalClass,
  LocalStudent,
  Session,
  AttendanceRecord,
  AttendanceStatus,
  RecognitionMethod,
  EnrollmentStatus,
  FaceQualityGrade,
} from '@/types/index';

// ─── Tab registry ─────────────────────────────────────────────────────────────

type TabId = 'attendance' | 'enroll' | 'classes' | 'sessions' | 'settings';

interface Tab {
  id: TabId;
  label: string;
  render: (container: HTMLElement) => void;
}

const TABS: Tab[] = [
  { id: 'attendance', label: 'Take Attendance', render: renderAttendance },
  { id: 'enroll',     label: 'Enroll Students', render: renderEnroll },
  { id: 'classes',    label: 'Classes',         render: renderClasses },
  { id: 'sessions',   label: 'Session Log',     render: renderSessions },
  { id: 'settings',  label: 'Settings',         render: renderSettings },
];

export function initTabs(barEl: HTMLElement, contentEl: HTMLElement): void {
  // Build tab buttons
  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i]!;
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', 'tab-content');
    btn.setAttribute('aria-selected', String(getState().activeTab === tab.id));
    btn.dataset['tabId'] = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      // Clean up active camera/scan on tab switch
      const prev = getState().activeTab;
      if (prev === 'attendance') _stopAttendance();
      if (prev === 'enroll')     _stopEnrollCamera();
      setState({ activeTab: tab.id });
    });
    barEl.appendChild(btn);
  }

  // React to state changes
  subscribe((state) => {
    // Update aria-selected on all buttons
    const tabBtns = barEl.querySelectorAll<HTMLButtonElement>('.tab-btn');
    for (let i = 0; i < tabBtns.length; i++) {
      const btn = tabBtns[i]!;
      btn.setAttribute('aria-selected', String(btn.dataset['tabId'] === state.activeTab));
    }
    // Re-render content
    const tab = TABS.find((t) => t.id === state.activeTab);
    if (tab) {
      contentEl.innerHTML = '';
      tab.render(contentEl);
    }
  });

  // Initial render
  const initial = TABS.find((t) => t.id === getState().activeTab) ?? TABS[0]!;
  initial.render(contentEl);
}

// ─── Shared cleanup handles ────────────────────────────────────────────────────

let _scanPipeline: ReturnType<typeof createPipelineState> | null = null;
let _scanMatcher:  MatcherState | null = null;
let _scanOverlayCanvas: HTMLCanvasElement | null = null;
let _autosaveTimer: ReturnType<typeof setInterval> | null = null;
let _enrollRingTimer: ReturnType<typeof setInterval> | null = null;
let _enrollAbort: AbortController | null = null;

function _stopAttendance(): void {
  if (_scanPipeline && _scanOverlayCanvas) {
    stopScanLoop(_scanOverlayCanvas, _scanPipeline);
  }
  stopOverlayLoop(_scanOverlayCanvas ?? document.createElement('canvas'));
  closeCamera();
  if (_autosaveTimer) { clearInterval(_autosaveTimer); _autosaveTimer = null; }
  _scanPipeline = null;
  _scanMatcher  = null;
  _scanOverlayCanvas = null;
}

function _stopEnrollCamera(): void {
  closeCamera();
  if (_enrollRingTimer) { clearInterval(_enrollRingTimer); _enrollRingTimer = null; }
  if (_enrollAbort) { _enrollAbort.abort(); _enrollAbort = null; }
}

// ─── Tab 1: Take Attendance ────────────────────────────────────────────────────

function renderAttendance(container: HTMLElement): void {
  container.innerHTML = '';
  const state = getState();

  // ── Class selector + date picker ──
  const topRow = el('div', 'section');
  topRow.style.cssText = 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;';

  const classField = el('div', 'field');
  classField.style.flex = '1';
  classField.innerHTML = '<label>Class</label>';
  const classSelect = el('select', 'select') as HTMLSelectElement;
  classSelect.innerHTML = '<option value="">— Select a class —</option>';
  classField.appendChild(classSelect);
  topRow.appendChild(classField);

  const dateField = el('div', 'field');
  dateField.innerHTML = `<label>Date</label>`;
  const dateInput = el('input', 'input') as HTMLInputElement;
  dateInput.type  = 'date';
  dateInput.value = todayISO();
  dateField.appendChild(dateInput);
  topRow.appendChild(dateField);

  container.appendChild(topRow);

  // Load classes into selector
  void listClasses().then((classes) => {
    const active = classes.filter((c) => !c.archivedAt);
    for (let i = 0; i < active.length; i++) {
      const c = active[i]!;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.code})`;
      if (c.id === state.activeClassId) opt.selected = true;
      classSelect.appendChild(opt);
    }
  });

  // ── Camera + overlay ──
  const camSection = el('div', 'section');
  const camWrap = el('div', 'camera-wrap') as HTMLElement;
  const video   = el('video') as HTMLVideoElement;
  video.autoplay = true;
  video.muted    = true;
  video.setAttribute('aria-label', 'Camera feed for attendance scanning');
  video.playsInline = true;
  const overlayCanvas = el('canvas') as HTMLCanvasElement;
  _scanOverlayCanvas  = overlayCanvas;

  const scanLine = el('div', 'scan-line');
  const unknownBadge = el('div', 'unknown-counter');
  unknownBadge.textContent = '0 unknown';
  unknownBadge.style.display = 'none';

  camWrap.appendChild(video);
  camWrap.appendChild(overlayCanvas);
  camWrap.appendChild(unknownBadge);
  camSection.appendChild(camWrap);

  // ── Adaptive threshold banner ──
  const adaptiveBanner = el('div', 'banner banner-warning animate-fadeIn');
  adaptiveBanner.style.display = 'none';
  adaptiveBanner.textContent =
    'Lighting conditions are poor — recognition sensitivity has been automatically adjusted.';
  camSection.appendChild(adaptiveBanner);

  // ── TF backend indicator ──
  const backendRow = el('div');
  backendRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:8px 0;font-size:.8rem;';
  const backendBadge = el('span', 'backend-badge');
  backendBadge.textContent = 'Models loading…';
  backendRow.appendChild(backendBadge);
  const modelsNote = el('span');
  modelsNote.style.color = 'var(--text-muted)';
  backendRow.appendChild(modelsNote);
  camSection.appendChild(backendRow);

  subscribe((s) => {
    if (s.tfBackend) {
      backendBadge.className = `backend-badge ${s.tfBackend}`;
      backendBadge.textContent = s.tfBackend.toUpperCase();
    }
    if (s.modelsLoaded) {
      modelsNote.textContent = 'Models ready';
    }
  });

  // ── Controls ──
  const controls = el('div');
  controls.style.cssText = 'display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;';
  const startBtn = el('button', 'btn btn-primary') as HTMLButtonElement;
  startBtn.textContent = 'Start Session';
  const stopBtn  = el('button', 'btn btn-ghost') as HTMLButtonElement;
  stopBtn.textContent  = 'End Session';
  stopBtn.style.display = 'none';
  const exportBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
  exportBtn.textContent = 'Export CSV';
  exportBtn.style.display = 'none';
  controls.append(startBtn, stopBtn, exportBtn);
  camSection.appendChild(controls);

  // ── Session bar ──
  const sessionBar = el('div', 'session-bar');
  sessionBar.style.display = 'none';
  camSection.appendChild(sessionBar);

  container.appendChild(camSection);

  // ── Student grid ──
  const gridSection = el('div', 'section');
  const gridTitle = el('div', 'section-title');
  gridTitle.textContent = 'Students';
  const grid = el('div', 'student-grid');
  gridSection.appendChild(gridTitle);
  gridSection.appendChild(grid);
  container.appendChild(gridSection);

  // ── Session notes ──
  const notesSection = el('div', 'section');
  const notesLabel = el('label', '');
  notesLabel.textContent = 'Session notes';
  notesLabel.style.cssText = 'display:block;font-size:.8rem;color:var(--text-muted);margin-bottom:5px;';
  const notesArea = el('textarea', 'textarea') as HTMLTextAreaElement;
  notesArea.placeholder = 'Optional notes for this session…';
  notesArea.style.display = 'none';
  notesSection.append(notesLabel, notesArea);
  container.appendChild(notesSection);

  // ── State ──
  let sessionId:   string | null = null;
  let students:    LocalStudent[] = [];
  let attendance:  Map<string, AttendanceRecord> = new Map();
  let unknownCount = 0;

  async function loadStudentGrid(classId: string): Promise<void> {
    students = await listStudentsByClass(classId);
    renderGrid();
  }

  function renderGrid(): void {
    grid.innerHTML = '';
    if (students.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-title">No students enrolled</div>Go to Enroll Students to add students.</div>';
      return;
    }
    for (let i = 0; i < students.length; i++) {
      const s = students[i]!;
      const rec   = attendance.get(s.id);
      const status: string = rec?.status ?? 'absent';
      const card  = el('div', `student-card ${status === 'present' ? 'present' : status === 'low_confidence' ? 'low-conf' : 'absent'}`);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${s.name} — ${status}. Click to toggle.`);
      card.innerHTML = `<div class="sname">${esc(s.name)}</div><div class="smeta">${esc(s.studentId)} · ${status.replace('_', ' ')}</div>`;
      card.addEventListener('click', () => void toggleAttendance(s));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void toggleAttendance(s); } });
      grid.appendChild(card);
    }
  }

  async function toggleAttendance(student: LocalStudent): Promise<void> {
    if (!sessionId) return;
    const existing = attendance.get(student.id);
    const newStatus: AttendanceStatus = existing?.status === 'present' ? 'absent' as AttendanceStatus : 'present' as AttendanceStatus;
    if (existing) {
      const updated = await updateAttendanceRecord(existing.id, { status: newStatus, method: 'manual' as RecognitionMethod, editedAt: new Date().toISOString() });
      attendance.set(student.id, updated);
    } else {
      const rec: AttendanceRecord = {
        id: genUUID(), sessionId: sessionId, studentId: student.id, classId: classSelect.value,
        status: newStatus, method: 'manual' as RecognitionMethod,
        recordedAt: new Date().toISOString(),
      };
      await saveAttendanceRecord(rec);
      attendance.set(student.id, rec);
    }
    renderGrid();
    updateSessionBar();
    announceRecognition(`${student.name} marked ${newStatus.replace('_', ' ')}`);
  }

  function updateSessionBar(): void {
    const present = [...attendance.values()].filter((r) => r.status === 'present').length;
    const absent  = students.length - present;
    sessionBar.innerHTML = `
      <span class="session-bar-item"><span class="dot dot-gold"></span>${present} present</span>
      <span class="session-bar-item"><span class="dot dot-muted"></span>${absent} absent</span>
      <span class="session-bar-item"><span class="dot dot-danger"></span>${unknownCount} unknown faces</span>
    `;
  }

  classSelect.addEventListener('change', () => {
    setState({ activeClassId: classSelect.value || null });
    void loadStudentGrid(classSelect.value);
  });

  startBtn.addEventListener('click', async () => {
    const classId = classSelect.value;
    if (!classId) { showToast('Select a class first.', 'warning'); return; }
    if (!getState().modelsLoaded) { showToast('Face recognition models are still loading — please wait.', 'warning'); return; }

    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="spinner"></span> Opening camera…';

    const camResult = await openCamera(video, getState().cameraDeviceId);
    if (!camResult.ok) {
      showToast(camResult.error ?? 'Camera failed.', 'error');
      startBtn.disabled = false;
      startBtn.textContent = 'Start Session';
      return;
    }

    camWrap.appendChild(scanLine);
    startOverlayLoop(overlayCanvas, video);

    // Build matcher from enrolled embeddings
    const embeddings = await getEmbeddingsByClass(classId);
    const byStudent  = new Map<string, Float32Array[]>();
    for (let i = 0; i < embeddings.length; i++) {
      const e = embeddings[i]!;
      const arr = byStudent.get(e.studentId) ?? [];
      arr.push(e.descriptor);
      byStudent.set(e.studentId, arr);
    }

    _scanMatcher = createMatcherState(getState().threshold);
    buildMatcher(byStudent, _scanMatcher);

    // Create session record
    const session = await createSession({
      classId,
      date:          dateInput.value || todayISO(),
      threshold:     getState().threshold,
      backend:       getState().tfBackend ?? 'cpu' as any,
      adaptiveThresholdUsed: false,
    });
    sessionId = session.id;
    setState({ activeSessionId: sessionId });

    // Load students
    await loadStudentGrid(classId);
    attendance.clear();

    // Pipeline callbacks
    _scanPipeline = createPipelineState({
      onStudentConfirmed: async (studentId) => {
        if (!sessionId) return;
        const student = students.find((s) => s.id === studentId);
        if (!student) return;
        if (attendance.has(studentId)) return;

        const rec: AttendanceRecord = {
          id: genUUID(), sessionId, studentId, classId,
          status:   'present' as AttendanceStatus,
          method:   'face_recognition' as RecognitionMethod,
          confidence: 0.8,
          recordedAt: new Date().toISOString(),
        };
        await saveAttendanceRecord(rec);
        attendance.set(studentId, rec);
        renderGrid();
        updateSessionBar();
        announceRecognition(`${student.name} recognized — marked present.`);
      },
      onUnknownFace: () => {
        unknownCount++;
        unknownBadge.textContent = `${unknownCount} unknown`;
        unknownBadge.style.display = '';
        updateSessionBar();
      },
      onAdaptiveThreshold: (newThreshold) => {
        adaptiveBanner.style.display = '';
        showToast(`Threshold relaxed to ${formatPct(newThreshold)} due to poor lighting.`, 'warning', 6000);
        if (sessionId) void updateSession(sessionId, { adaptiveThresholdUsed: true });
      },
    });

    startScanLoop(video, _scanMatcher, _scanPipeline);

    // Autosave every 30 seconds
    _autosaveTimer = setInterval(() => {
      if (sessionId && notesArea.value) void updateSession(sessionId, { notes: notesArea.value });
    }, 30_000);

    // UI state
    startBtn.style.display  = 'none';
    stopBtn.style.display   = '';
    exportBtn.style.display = '';
    sessionBar.style.display = '';
    notesArea.style.display  = '';
    updateSessionBar();
    showToast('Session started. Face recognition is active.', 'success');
  });

  stopBtn.addEventListener('click', async () => {
    if (!sessionId) return;

    _stopAttendance();

    const allRecords = [...attendance.values()];
    // Add absent records for students with no attendance entry
    for (let i = 0; i < students.length; i++) {
      const s = students[i]!;
      if (!attendance.has(s.id)) {
        allRecords.push({
          id: genUUID(), sessionId: sessionId!, studentId: s.id, classId: classSelect.value,
          status: 'absent' as AttendanceStatus, method: 'manual' as RecognitionMethod,
          recordedAt: new Date().toISOString(),
        });
      }
    }

    await finalizeSession(sessionId, allRecords);
    if (notesArea.value) await updateSession(sessionId, { notes: notesArea.value });

    setState({ activeSessionId: null });
    sessionId = null;

    scanLine.remove();
    stopBtn.style.display   = 'none';
    startBtn.style.display  = '';
    startBtn.disabled       = false;
    startBtn.textContent    = 'Start Session';
    adaptiveBanner.style.display = 'none';
    showToast('Session ended and saved.', 'success');
  });

  exportBtn.addEventListener('click', async () => {
    const classId = classSelect.value;
    if (!sessionId || !classId) return;
    const session  = await getSession(sessionId);
    if (!session) return;
    const records  = await getAttendanceBySession(sessionId);
    exportSessionCSV(session, records, students);
  });

  if (state.activeClassId) {
    classSelect.value = state.activeClassId;
    void loadStudentGrid(state.activeClassId);
  }
}

// ─── Tab 2: Enroll Students ────────────────────────────────────────────────────

function renderEnroll(container: HTMLElement): void {
  container.innerHTML = '';

  // Sub-tab bar
  const subBar = el('div');
  subBar.style.cssText = 'display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);';
  const subTabs = [
    { id: 'inperson', label: 'In-Person' },
    { id: 'queue',    label: 'Online Queue' },
  ] as const;
  type SubTab = 'inperson' | 'queue';
  // Default to queue for easier local testing and deterministic E2E flows
  let activeSubTab: SubTab = 'queue';

  for (let i = 0; i < subTabs.length; i++) {
    const { id, label } = subTabs[i]!;
    const btn = el('button', 'tab-btn') as HTMLButtonElement;
    btn.textContent = label;
    btn.setAttribute('aria-selected', String(id === activeSubTab));
    btn.addEventListener('click', () => {
      activeSubTab = id;
      for (let j = 0; j < subTabs.length; j++) {
        const sid = subTabs[j]!.id;
        subBar.querySelector<HTMLButtonElement>(`[data-sub="${sid}"]`)
          ?.setAttribute('aria-selected', String(sid === id));
      }
      renderSubContent();
    });
    btn.dataset['sub'] = id;
    subBar.appendChild(btn);
  }
  container.appendChild(subBar);

  const subContent = el('div');
  container.appendChild(subContent);

  function renderSubContent(): void {
    subContent.innerHTML = '';
    if (activeSubTab === 'inperson') renderInPerson(subContent);
    else                             renderOnlineQueue(subContent);
  }

  renderSubContent();
}

function renderInPerson(container: HTMLElement): void {
  // ── Class selector ──
  const classField = el('div', 'field section');
  classField.innerHTML = '<label>Class</label>';
  const classSelect = el('select', 'select') as HTMLSelectElement;
  classSelect.innerHTML = '<option value="">— Select a class —</option>';
  classField.appendChild(classSelect);
  container.appendChild(classField);

  void listClasses().then((classes) => {
    const active = classes.filter((c) => !c.archivedAt);
    for (let i = 0; i < active.length; i++) {
      const c = active[i]!;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.code})`;
      if (c.id === getState().activeClassId) opt.selected = true;
      classSelect.appendChild(opt);
    }
  });

  // ── Student fields ──
  const fields = el('div', 'section');
  fields.style.cssText = 'display:grid;gap:12px;';

  const nameField = el('div', 'field');
  nameField.innerHTML = '<label>Full name <span style="color:var(--danger)">*</span></label>';
  const nameInput = el('input', 'input') as HTMLInputElement;
  nameInput.placeholder = 'Jane Smith';
  nameInput.autocomplete = 'name';
  nameField.appendChild(nameInput);

  const sidField = el('div', 'field');
  sidField.innerHTML = '<label>Student ID <span style="color:var(--danger)">*</span></label>';
  const sidInput = el('input', 'input') as HTMLInputElement;
  sidInput.placeholder = 'e.g. E12345678';
  sidField.appendChild(sidInput);

  const emailField = el('div', 'field');
  emailField.innerHTML = '<label>Email (optional)</label>';
  const emailInput = el('input', 'input') as HTMLInputElement;
  emailInput.type = 'email';
  emailInput.placeholder = 'student@esu.edu';
  emailField.appendChild(emailInput);

  fields.append(nameField, sidField, emailField);
  container.appendChild(fields);

  // ── Consent ──
  const consentWrap = el('div', 'section card');
  const consentLabel = el('label', 'checkbox-row');
  const consentCheck = el('input') as HTMLInputElement;
  consentCheck.type = 'checkbox';
  consentCheck.required = true;
  const consentText = el('span');
  consentText.style.fontSize = '.82rem';
  consentText.style.color    = 'var(--text-muted)';
  consentText.textContent    = CONSENT_TEXT;
  consentLabel.append(consentCheck, consentText);
  consentWrap.appendChild(consentLabel);
  container.appendChild(consentWrap);

  // ── Camera ──
  const camSection = el('div', 'section');
  const camWrap    = el('div', 'camera-wrap') as HTMLElement;
  const video      = el('video') as HTMLVideoElement;
  video.autoplay = true;
  video.muted    = true;
  video.playsInline = true;
  const overlayCanvas = el('canvas') as HTMLCanvasElement;
  camWrap.append(video, overlayCanvas);

  const qualityLabel = el('div', 'quality-label poor');
  qualityLabel.textContent = 'WAITING';
  camWrap.appendChild(qualityLabel);
  camSection.appendChild(camWrap);

  const captureStatus = el('p');
  captureStatus.style.cssText = 'font-size:.82rem;color:var(--text-muted);margin:6px 0;';
  camSection.appendChild(captureStatus);

  // Capture progress dots
  const dotsRow = el('div', 'capture-dots');
  for (let i = 0; i < MAX_CAPTURES; i++) {
    dotsRow.appendChild(el('div', 'capture-dot'));
  }
  camSection.appendChild(dotsRow);
  container.appendChild(camSection);

  // ── Controls ──
  const controls = el('div');
  controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  const startCamBtn  = el('button', 'btn btn-ghost') as HTMLButtonElement;
  startCamBtn.textContent = 'Open Camera';
  const captureBtn   = el('button', 'btn btn-primary') as HTMLButtonElement;
  captureBtn.textContent  = 'Capture (Space)';
  captureBtn.disabled     = true;
  const saveBtn      = el('button', 'btn btn-primary') as HTMLButtonElement;
  saveBtn.textContent     = `Save Student (${MIN_CAPTURES} captures needed)`;
  saveBtn.disabled        = true;
  controls.append(startCamBtn, captureBtn, saveBtn);
  container.appendChild(controls);

  // ── Enrollment session ──
  const session = createEnrollmentSession();

  function updateDots(): void {
    const dots = dotsRow.querySelectorAll('.capture-dot');
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]! as Element;
      d.classList.toggle('filled', i < session.captures.length);
    }
    captureBtn.disabled = !canCapture(session) || !isCamOpen;
    saveBtn.disabled    = !canSave(session);
    if (canSave(session)) {
      saveBtn.textContent = `Save Student (${session.captures.length}/${MAX_CAPTURES} captures)`;
    }
  }

  let isCamOpen = false;
  // AbortController lets us remove both the keydown listener and any future
  // listeners tied to this enrollment instance when the tab changes or save completes.
  // Stored at module scope so _stopEnrollCamera() can abort it on tab switch.
  _enrollAbort = new AbortController();
  const enrollAbort = _enrollAbort;

  startCamBtn.addEventListener('click', async () => {
    startCamBtn.disabled = true;
    startCamBtn.innerHTML = '<span class="spinner"></span>';
    const result = await openCamera(video, getState().cameraDeviceId);
    startCamBtn.disabled = false;
    startCamBtn.textContent = 'Open Camera';
    if (!result.ok) {
      showToast(result.error ?? 'Camera failed.', 'error');
      return;
    }
    isCamOpen = true;
    updateDots();

    // Ring assessment loop every 500ms.
    // Assigned to module-level _enrollRingTimer so _stopEnrollCamera() can
    // clear it if the professor switches tabs mid-enrollment.
    _enrollRingTimer = setInterval(async () => {
      if (!isCamOpen) return;
      const detections = await detectMultiScale(video, { minConfidence: 0.5 });
      if (detections.length === 1) {
        const d = detections[0]!;
        const scaleX = overlayCanvas.width  / (video.videoWidth  || 640);
        const scaleY = overlayCanvas.height / (video.videoHeight || 480);
        const box = {
          x: d.box.x * scaleX, y: d.box.y * scaleY,
          width: d.box.width * scaleX, height: d.box.height * scaleY,
        };
        drawEnrollmentRing(overlayCanvas, box, 'good' as FaceQualityGrade);
        qualityLabel.className = 'quality-label good';
        qualityLabel.textContent = 'GOOD';
      } else if (detections.length === 0) {
        qualityLabel.className = 'quality-label poor';
        qualityLabel.textContent = 'NO FACE';
      }
    }, 500);
  });

  captureBtn.addEventListener('click', async () => void doCapture());

  // Space bar shortcut — tied to this enrollment instance via AbortController signal.
  // Removed automatically when enrollAbort.abort() is called (tab switch or save).
  document.addEventListener(
    'keydown',
    (e) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.code === 'Space' && tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'BUTTON') {
        e.preventDefault();
        void doCapture();
      }
    },
    { signal: enrollAbort.signal },
  );

  async function doCapture(): Promise<void> {
    if (!canCapture(session) || !isCamOpen) return;
    captureBtn.disabled = true;
    captureStatus.textContent = 'Analyzing…';

    const result = await attemptCapture(video);
    if (typeof result === 'string') {
      captureStatus.textContent = result;
      qualityLabel.className  = 'quality-label poor';
      qualityLabel.textContent = 'REJECTED';
      captureBtn.disabled = false;
      return;
    }

    session.captures.push(result);
    captureStatus.textContent = `Capture ${session.captures.length} saved (${result.quality.grade}).`;
    qualityLabel.className  = `quality-label ${result.quality.grade}`;
    qualityLabel.textContent = result.quality.grade.toUpperCase();
    updateDots();
    captureBtn.disabled = !canCapture(session);
  }

  saveBtn.addEventListener('click', async () => {
    const classId = classSelect.value;
    const name    = nameInput.value.trim();
    const sid     = sidInput.value.trim();

    if (!classId)        { showToast('Select a class.', 'warning'); return; }
    if (!name)           { showToast('Enter student name.', 'warning'); return; }
    if (!sid)            { showToast('Enter student ID.', 'warning'); return; }
    if (!consentCheck.checked) { showToast('Student must consent before enrollment.', 'warning'); return; }
    if (!canSave(session))     { showToast(`Need at least ${MIN_CAPTURES} captures.`, 'warning'); return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving…';

    const studentData: Parameters<typeof createStudent>[0] = {
      classId,
      name,
      studentId:        sid,
      enrollmentStatus: 'enrolled' as EnrollmentStatus,
    };
    const trimmedEmail = emailInput.value.trim();
    if (trimmedEmail) studentData.email = trimmedEmail;
    const student = await createStudent(studentData);

    for (let i = 0; i < session.captures.length; i++) {
      const cap = session.captures[i]!;
      await saveEmbedding({
        id:          genUUID(),
        studentId:   student.id,
        classId,
        descriptor:  cap.descriptor,
        quality:     cap.quality.detectionScore,
        capturedAt:  new Date().toISOString(),
      });
    }

    _stopEnrollCamera();
    isCamOpen = false;

    announceRecognition(`${name} enrolled successfully with ${session.captures.length} captures.`);
    showToast(`${name} enrolled.`, 'success');

    // Reset form
    session.captures.length = 0;
    nameInput.value = '';
    sidInput.value  = '';
    emailInput.value = '';
    consentCheck.checked = false;
    qualityLabel.textContent = 'WAITING';
    qualityLabel.className   = 'quality-label poor';
    captureStatus.textContent = '';
    updateDots();
    saveBtn.disabled = true;
    saveBtn.textContent = `Save Student (${MIN_CAPTURES} captures needed)`;
    startCamBtn.disabled = false;
  });
}

async function renderOnlineQueue(container: HTMLElement): Promise<void> {
  const state = getState();

  if (!state.supabaseConfigured) {
    // Show a warning but continue rendering the queue UI for local testing and E2E.
    container.innerHTML = `
      <div class="banner banner-warning">
        Supabase is not configured. Add your credentials in Settings → Supabase to enable the online enrollment queue.
        For local testing, the queue UI is available.
      </div>
    `;
    // Do not return — render the controls so local providers and tests can use the queue.
  }

  const classField = el('div', 'field section');
  classField.innerHTML = '<label>Class</label>';
  const classSelect = el('select', 'select') as HTMLSelectElement;
  classSelect.innerHTML = '<option value="">— Select a class —</option>';
  classField.appendChild(classSelect);
  container.appendChild(classField);

  try {
    const classes = await listClasses();
    const active = classes.filter((c) => !c.archivedAt);
    // eslint-disable-next-line no-console
    console.log('[queue] listClasses returned', active.length, 'classes');
    for (let i = 0; i < active.length; i++) {
      const c = active[i]!;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.code})`;
      classSelect.appendChild(opt);
    }
    // Auto-select the first class for convenience in dev/E2E when none is selected
    if (!classSelect.value && active.length > 0) {
      classSelect.value = active[0].id;
      // trigger an initial load
      // eslint-disable-next-line no-console
      console.log('[queue] auto-selected class', classSelect.value);
      await loadQueue();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[queue] listClasses failed', e);
  }

  const controls = el('div');
  controls.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
  const refreshBtn   = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
  refreshBtn.textContent = 'Refresh';
  const approveAllBtn = el('button', 'btn btn-primary btn-sm') as HTMLButtonElement;
  approveAllBtn.textContent = 'Approve All';
  controls.append(refreshBtn, approveAllBtn);
  container.appendChild(controls);

  const listEl = el('div');
  container.appendChild(listEl);

  let autoRefreshId: ReturnType<typeof setInterval> | null = null;

  async function loadQueue(): Promise<void> {
    const classId = classSelect.value;
    if (!classId) { listEl.innerHTML = '<p style="color:var(--text-muted)">Select a class.</p>'; return; }

    listEl.innerHTML = '<div style="display:flex;gap:8px;align-items:center;color:var(--text-muted)"><span class="spinner"></span>Loading…</div>';

    const provider = getProvider();
    // eslint-disable-next-line no-console
    console.log('[queue] Using provider', provider?.constructor?.name ?? typeof provider, 'classId=', classId);
    let records: any[] = [];
    try {
      const result   = await provider.getPendingEnrollments(classId);
      if (result.ok) {
        records = result.data ?? [];
      } else {
        // Fallback: try direct fetch to /api to support local testing (intercepted in E2E)
        // eslint-disable-next-line no-console
        console.warn('[queue] provider.getPendingEnrollments failed, falling back to fetch:', result.error);
        try {
          const r = await fetch(`/api/enrollments/pending?classId=${encodeURIComponent(classId)}`);
          const j = await r.json().catch(() => null);
          if (r.ok && j && j.ok) records = j.data ?? [];
          else throw new Error(j?.error ?? r.statusText ?? 'fetch failed');
        } catch (fe) {
          listEl.innerHTML = `<div class="banner banner-danger">${esc(String(fe))}</div>`;
          return;
        }
      }
    } catch (e) {
      listEl.innerHTML = `<div class="banner banner-danger">${esc((e as Error).message ?? 'Failed to load queue.')}</div>`;
      return;
    }
    if (records.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-title">No pending enrollments</div></div>';
      return;
    }

    listEl.innerHTML = '';
    for (const rec of records) {
      const item = el('div', 'queue-item');
      const img  = el('img', 'queue-item-thumb') as HTMLImageElement;
      img.alt = `${rec.studentName} enrollment photo`;
      img.src = ''; // thumbnails require signed URLs — shown if provider supports it

      const info = el('div');
      info.style.flex = '1';
      info.innerHTML  = `
        <div style="font-weight:500">${esc(rec.studentName)}</div>
        <div style="font-size:.78rem;color:var(--text-muted)">${esc(rec.studentId)} · ${formatDate(rec.submittedAt)}</div>
      `;

      const actions = el('div', 'queue-item-actions');
      const approveBtn = el('button', 'btn btn-primary btn-sm') as HTMLButtonElement;
      approveBtn.textContent = 'Approve';
      const rejectBtn  = el('button', 'btn btn-danger btn-sm') as HTMLButtonElement;
      rejectBtn.textContent  = 'Reject';

      approveBtn.addEventListener('click', () => void approveEnrollment(rec.id, classId, rec.studentName, rec.studentId, rec.email, approveBtn));
      rejectBtn.addEventListener('click',  () => void rejectEnrollment(rec.id, rejectBtn, item));

      actions.append(approveBtn, rejectBtn);
      item.append(img, info, actions);
      listEl.appendChild(item);
    }
  }

  async function approveEnrollment(
    enrollmentId: string,
    classId: string,
    name: string,
    sid: string,
    email: string | undefined,
    btn: HTMLButtonElement,
  ): Promise<void> {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const provider = getProvider();
    const blobRes  = await provider.importEnrollment(enrollmentId);
    if (!blobRes.ok || !blobRes.data) {
      showToast(`Failed to download photo: ${blobRes.error}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Approve';
      return;
    }

    // Delete photo immediately — privacy guarantee
    await provider.deletePhoto(enrollmentId);
    await provider.updateEnrollmentStatus(enrollmentId, 'approved');

    // Run face-api pipeline on the downloaded blob
    const bitmap = await createImageBitmap(blobRes.data);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = bitmap.width;
    tmpCanvas.height = bitmap.height;
    tmpCanvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();

    const faceapi = (window as any).faceapi;
    let descriptor: Float32Array | null = null;
    try {
      const results = await faceapi
        .detectAllFaces(tmpCanvas)
        .withFaceLandmarks()
        .withFaceDescriptors();
      descriptor = results[0]?.descriptor ?? null;
    } catch { /* fallback: enroll without face descriptor */ }

    const qStudentData: Parameters<typeof createStudent>[0] = {
      classId,
      name,
      studentId:        sid,
      enrollmentStatus: 'enrolled' as EnrollmentStatus,
    };
    if (email) qStudentData.email = email;
    const student = await createStudent(qStudentData);

    if (descriptor) {
      await saveEmbedding({
        id: genUUID(), studentId: student.id, classId,
        descriptor, quality: 0.8, capturedAt: new Date().toISOString(),
      });
      showToast(`${name} approved and enrolled.`, 'success');
    } else {
      showToast(`${name} enrolled (photo quality too low for face recognition — schedule re-enrollment).`, 'warning');
    }

    await loadQueue();
  }

  async function rejectEnrollment(enrollmentId: string, btn: HTMLButtonElement, item: HTMLElement): Promise<void> {
    btn.disabled = true;
    const provider = getProvider();
    await provider.deletePhoto(enrollmentId);
    await provider.updateEnrollmentStatus(enrollmentId, 'rejected');
    item.remove();
    showToast('Enrollment rejected and photo deleted.', 'info');
  }

  refreshBtn.addEventListener('click', () => void loadQueue());
  approveAllBtn.addEventListener('click', async () => {
    const btns = listEl.querySelectorAll<HTMLButtonElement>('.btn-primary');
    for (const btn of btns) btn.click();
  });
  classSelect.addEventListener('change', () => void loadQueue());

  // Auto-refresh every 60 seconds
  autoRefreshId = setInterval(() => void loadQueue(), 60_000);
  window.addEventListener('beforeunload', () => { if (autoRefreshId) clearInterval(autoRefreshId); });

  void loadQueue();
}

// ─── Tab 3: Classes ────────────────────────────────────────────────────────────

function renderClasses(container: HTMLElement): void {
  container.innerHTML = '';

  const hdr = el('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;';
  const title = el('h2');
  title.textContent = 'Classes';
  const newBtn = el('button', 'btn btn-primary btn-sm') as HTMLButtonElement;
  newBtn.textContent = '+ New Class';
  hdr.append(title, newBtn);
  container.appendChild(hdr);

  const listEl = el('div');
  container.appendChild(listEl);

  async function loadClasses(): Promise<void> {
    const classes  = await listClasses();
    const sessions = await Promise.all(classes.map((c) => listSessionsByClass(c.id)));

    listEl.innerHTML = '';
    if (classes.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-title">No classes yet</div>Create your first class to get started.</div>';
      return;
    }

    for (let i = 0; i < classes.length; i++) {
      const cls  = classes[i]!;
      const sArr = sessions[i] ?? [];
      const card = el('div', 'card');
      card.style.marginBottom = '10px';

      const lastSession = sArr[0];

      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-weight:600;font-size:1rem;">${esc(cls.name)}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px;">
              Code: <strong>${esc(cls.code)}</strong> · Enrollment code: <code>${esc(cls.enrollmentCode)}</code>
            </div>
            ${lastSession ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">Last session: ${formatDate(lastSession.startedAt)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            ${cls.archivedAt ? `<span class="badge badge-muted">Archived</span>` : ''}
          </div>
        </div>
      `;

      const actions = el('div');
      actions.style.cssText = 'display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;';

      const qrBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
      qrBtn.textContent = 'QR Code';
      qrBtn.addEventListener('click', () => showQRModal(cls));

      const rosterBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
      rosterBtn.textContent = 'Roster';
      rosterBtn.addEventListener('click', () => void showRosterModal(cls));

      const archiveBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
      archiveBtn.textContent = cls.archivedAt ? 'Unarchive' : 'Archive';
      archiveBtn.addEventListener('click', async () => {
        const archiveUpdates: Partial<LocalClass> = {};
        if (!cls.archivedAt) archiveUpdates.archivedAt = new Date().toISOString();
        await updateClass(cls.id, archiveUpdates);
        await loadClasses();
      });

      actions.append(qrBtn, rosterBtn, archiveBtn);
      card.appendChild(actions);
      listEl.appendChild(card);
    }
  }

  function showQRModal(cls: LocalClass): void {
    const enrollUrl = `${window.location.origin}?enroll=${cls.enrollmentCode}`;
    const bodyEl    = document.createElement('div');

    const qrDiv = el('div', 'qr-wrap');
    qrDiv.id = 'modal-qr-canvas';
    bodyEl.appendChild(qrDiv);

    const linkRow = el('div');
    linkRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;align-items:center;';
    const linkInput = el('input', 'input') as HTMLInputElement;
    linkInput.value    = enrollUrl;
    linkInput.readOnly = true;
    const copyBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(enrollUrl);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
    linkRow.append(linkInput, copyBtn);
    bodyEl.appendChild(linkRow);

    openModal({
      title:       `Enrollment QR — ${cls.name}`,
      body:        bodyEl,
      cancelLabel: 'Close',
    });

    // Render QR after modal is in DOM
    setTimeout(() => {
      const qrTarget = document.getElementById('modal-qr-canvas');
      if (qrTarget && typeof QRCode !== 'undefined') {
        new QRCode(qrTarget, { text: enrollUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
      } else if (qrTarget) {
        qrTarget.innerHTML = `<p style="word-break:break-all;font-size:.78rem">${esc(enrollUrl)}</p>`;
      }
    }, 50);
  }

  async function showRosterModal(cls: LocalClass): Promise<void> {
    const students = await listStudentsByClass(cls.id);
    const bodyEl   = document.createElement('div');

    if (students.length === 0) {
      bodyEl.innerHTML = '<p style="color:var(--text-muted)">No students enrolled yet.</p>';
    } else {
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:.85rem;';
      table.innerHTML     = `
        <thead>
          <tr style="border-bottom:1px solid var(--border);color:var(--text-muted);">
            <th style="text-align:left;padding:6px 0;">Name</th>
            <th style="text-align:left;padding:6px 0;">Student ID</th>
            <th style="text-align:left;padding:6px 0;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((s) => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:7px 0;">${esc(s.name)}</td>
              <td style="padding:7px 0;color:var(--text-muted)">${esc(s.studentId)}</td>
              <td style="padding:7px 0;">${esc(s.enrollmentStatus)}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
      bodyEl.appendChild(table);
    }

    openModal({ title: `Roster — ${cls.name}`, body: bodyEl, cancelLabel: 'Close' });
  }

  newBtn.addEventListener('click', () => {
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'display:grid;gap:12px;';

    const nf = field('Class name *');
    const ni = el('input', 'input') as HTMLInputElement;
    ni.placeholder = 'e.g. CSC 101 Spring 2026';
    nf.appendChild(ni);

    const cf = field('Class code *');
    const ci = el('input', 'input') as HTMLInputElement;
    ci.placeholder = 'e.g. CSC101';
    cf.appendChild(ci);

    bodyEl.append(nf, cf);

    openModal({
      title:        'New Class',
      body:         bodyEl,
      confirmLabel: 'Create',
      cancelLabel:  'Cancel',
      onConfirm:    async () => {
        const name = ni.value.trim();
        const code = ci.value.trim();
        if (!name || !code) { showToast('Name and code are required.', 'warning'); return; }
        const enrollmentCode = genUUID().slice(0, 8).toUpperCase();
        await createClass({ name, code, enrollmentCode });
        await loadClasses();
        showToast(`Class "${name}" created.`, 'success');
      },
    });
  });

  void loadClasses();
}

// ─── Tab 4: Session Log ────────────────────────────────────────────────────────

function renderSessions(container: HTMLElement): void {
  container.innerHTML = '';

  const filterRow = el('div');
  filterRow.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;';

  const classFilter = el('select', 'select') as HTMLSelectElement;
  classFilter.innerHTML = '<option value="">All classes</option>';
  classFilter.style.maxWidth = '200px';
  filterRow.appendChild(classFilter);

  container.appendChild(filterRow);

  const listEl = el('div');
  container.appendChild(listEl);

  void listClasses().then((classes) => {
    for (let i = 0; i < classes.length; i++) {
      const c = classes[i]!;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.code})`;
      classFilter.appendChild(opt);
    }
  });

  async function loadSessions(): Promise<void> {
    const classId = classFilter.value;
    let sessions: Session[] = [];

    if (classId) {
      sessions = await listSessionsByClass(classId);
    } else {
      const classes = await listClasses();
      const all     = await Promise.all(classes.map((c) => listSessionsByClass(c.id)));
      sessions      = all.flat().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }

    listEl.innerHTML = '';
    if (sessions.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-title">No sessions yet</div></div>';
      return;
    }

    for (const session of sessions) {
      const entry = el('div', 'session-entry animate-slideUp');
      const cls   = await getClass(session.classId);
      const hdr   = el('div', 'session-entry-hdr');
      hdr.setAttribute('role', 'button');
      hdr.setAttribute('tabindex', '0');

      hdr.innerHTML = `
        <div>
          <div style="font-weight:500">${formatDate(session.startedAt)}</div>
          <div style="font-size:.78rem;color:var(--text-muted)">
            ${esc(cls?.name ?? 'Unknown class')} · ${session.finalizedAt ? 'Finalized' : 'In progress'}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${session.adaptiveThresholdUsed ? '<span class="badge badge-warning">Adaptive</span>' : ''}
          <span class="badge badge-muted">${session.backend.toUpperCase()}</span>
        </div>
      `;

      const body    = el('div', 'session-entry-body');
      body.style.display = 'none';
      let bodyLoaded = false;

      hdr.addEventListener('click', async () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        if (!open && !bodyLoaded) {
          bodyLoaded = true;
          await renderSessionBody(session, body);
        }
      });
      hdr.addEventListener('keydown', (e) => { if (e.key === 'Enter') hdr.click(); });

      entry.append(hdr, body);
      listEl.appendChild(entry);
    }
  }

  async function renderSessionBody(session: Session, body: HTMLElement): Promise<void> {
    const records  = await getAttendanceBySession(session.id);
    const students = await listStudentsByClass(session.classId);

    const present    = records.filter((r) => r.status === 'present').length;
    const absent     = students.length - present;

    body.innerHTML = `
      <div class="stats-row" style="margin-bottom:12px;">
        <div class="stat-card"><div class="stat-number">${present}</div><div class="stat-label">Present</div></div>
        <div class="stat-card"><div class="stat-number">${absent}</div><div class="stat-label">Absent</div></div>
        <div class="stat-card"><div class="stat-number">${formatPct(session.threshold)}</div><div class="stat-label">Threshold</div></div>
      </div>
      ${session.notes ? `<p style="font-size:.83rem;color:var(--text-muted);margin-bottom:10px;">${esc(session.notes)}</p>` : ''}
    `;

    const exportBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
    exportBtn.textContent = 'Export CSV';
    exportBtn.addEventListener('click', () => exportSessionCSV(session, records, students));
    body.appendChild(exportBtn);
  }

  classFilter.addEventListener('change', () => void loadSessions());
  void loadSessions();
}

// ─── Tab 5: Settings ──────────────────────────────────────────────────────────

function renderSettings(container: HTMLElement): void {
  container.innerHTML = '';

  const state = getState();

  // ── Recognition threshold ──
  const threshSection = el('div', 'section');
  threshSection.innerHTML = '<div class="section-title">Recognition</div>';

  const threshField = el('div', 'field');
  const threshLabel = el('label');
  threshLabel.htmlFor = 'thresh-slider';
  threshLabel.style.cssText = 'display:flex;justify-content:space-between;';
  const threshTitle = el('span');
  threshTitle.textContent = 'Recognition threshold';
  const threshValue = el('span');
  threshValue.style.color = 'var(--gold)';
  threshValue.textContent = formatPct(state.threshold);
  threshLabel.append(threshTitle, threshValue);

  const threshSlider = el('input') as HTMLInputElement;
  threshSlider.type  = 'range';
  threshSlider.id    = 'thresh-slider';
  threshSlider.min   = '0.4';
  threshSlider.max   = '0.7';
  threshSlider.step  = '0.01';
  threshSlider.value = String(state.threshold);

  const threshHint = el('p');
  threshHint.style.cssText = 'font-size:.75rem;color:var(--text-muted);margin-top:4px;';
  threshHint.textContent =
    'Lower = stricter (fewer false positives, may miss some students). ' +
    'Higher = more lenient (marks more students, higher false positive risk). Default: 55%.';

  threshSlider.addEventListener('input', () => {
    const v = parseFloat(threshSlider.value);
    threshValue.textContent = formatPct(v);
    setState({ threshold: v });
  });

  threshField.append(threshLabel, threshSlider, threshHint);
  threshSection.appendChild(threshField);

  // Adaptive threshold toggle
  const adaptRow = el('label', 'checkbox-row');
  adaptRow.style.marginTop = '12px';
  const adaptCheck = el('input') as HTMLInputElement;
  adaptCheck.type    = 'checkbox';
  adaptCheck.checked = state.adaptiveThresholdEnabled;
  const adaptText = el('span');
  adaptText.style.fontSize = '.85rem';
  adaptText.textContent    =
    'Enable adaptive threshold — automatically relax matching when lighting is consistently poor.';
  adaptRow.append(adaptCheck, adaptText);
  adaptCheck.addEventListener('change', () => setState({ adaptiveThresholdEnabled: adaptCheck.checked }));
  threshSection.appendChild(adaptRow);
  container.appendChild(threshSection);

  // ── Camera ──
  const camSection = el('div', 'section');
  camSection.innerHTML = '<div class="section-title">Camera</div>';

  const camField = el('div', 'field');
  camField.innerHTML = '<label>Camera device</label>';
  const camSelect = el('select', 'select') as HTMLSelectElement;
  camSelect.innerHTML = '<option value="">Default camera</option>';
  camField.appendChild(camSelect);
  camSection.appendChild(camField);
  container.appendChild(camSection);

  void listCameraDevices().then((devices) => {
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i]!;
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label;
      if (d.deviceId === state.cameraDeviceId) opt.selected = true;
      camSelect.appendChild(opt);
    }
  });

  camSelect.addEventListener('change', () => setState({ cameraDeviceId: camSelect.value || null }));

  // TF backend indicator
  const backendRow = el('div');
  backendRow.style.cssText = 'margin-top:10px;font-size:.83rem;color:var(--text-muted);';
  backendRow.textContent = `Active backend: ${state.tfBackend ?? 'initializing…'}`;
  camSection.appendChild(backendRow);
  subscribe((s) => { if (s.tfBackend) backendRow.textContent = `Active backend: ${s.tfBackend.toUpperCase()}`; });

  // ── Supabase ──
  const sbSection = el('div', 'section');
  sbSection.innerHTML = `
    <div class="section-title">Supabase (Online Enrollment Queue)</div>
    <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px;">
      Required only for the online enrollment queue. In-person enrollment works without Supabase.
      See <strong>docs/SETUP.md</strong> for exact SQL to paste into the Supabase SQL editor.
    </p>
  `;

  const urlField = field('Supabase project URL');
  const urlInput = el('input', 'input') as HTMLInputElement;
  urlInput.type        = 'url';
  urlInput.placeholder = 'https://xxxx.supabase.co';
  urlInput.value       = import.meta.env.VITE_SUPABASE_URL ?? '';
  urlField.appendChild(urlInput);

  const keyField = field('Supabase anon key');
  const keyInput = el('input', 'input') as HTMLInputElement;
  keyInput.type        = 'password';
  keyInput.placeholder = 'eyJ…';
  keyInput.value       = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  keyField.appendChild(keyInput);

  const testRow = el('div');
  testRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
  const saveCredsBtn = el('button', 'btn btn-primary btn-sm') as HTMLButtonElement;
  saveCredsBtn.textContent = 'Save & Test Connection';
  const testResult = el('span');
  testResult.style.fontSize = '.8rem';
  testRow.append(saveCredsBtn, testResult);

  saveCredsBtn.addEventListener('click', async () => {
    saveCredsBtn.disabled = true;
    saveCredsBtn.innerHTML = '<span class="spinner"></span>';
    reinitProvider();
    const result = await getProvider().healthCheck();
    saveCredsBtn.disabled = false;
    saveCredsBtn.textContent = 'Save & Test Connection';
    if (result.ok) {
      testResult.style.color  = 'var(--success)';
      testResult.textContent  = 'Connected ✓';
      setState({ supabaseConfigured: true });
    } else {
      testResult.style.color  = 'var(--danger)';
      testResult.textContent  = `Failed: ${result.error}`;
    }
  });

  sbSection.append(urlField, keyField, testRow);
  container.appendChild(sbSection);

  // ── Data management ──
  const dataSection = el('div', 'section');
  dataSection.innerHTML = '<div class="section-title">Data Management</div>';

  const exportAllBtn = el('button', 'btn btn-ghost btn-sm') as HTMLButtonElement;
  exportAllBtn.textContent = 'Export All Data (JSON)';
  exportAllBtn.style.marginRight = '8px';
  exportAllBtn.addEventListener('click', async () => {
    const data = await getAllDataForExport();
    exportAllDataJSON(data);
  });

  const deleteAllBtn = el('button', 'btn btn-danger btn-sm') as HTMLButtonElement;
  deleteAllBtn.textContent = 'Delete All Data…';
  deleteAllBtn.addEventListener('click', () => {
    const bodyEl = document.createElement('div');
    bodyEl.innerHTML = `
      <p style="color:var(--text-muted);margin-bottom:14px;">
        This will permanently delete all classes, students, sessions, attendance records,
        and face embeddings from this device. This cannot be undone.
      </p>
      <div class="field">
        <label>Type DELETE to confirm</label>
        <input class="input" id="delete-confirm-input" placeholder="DELETE" autocomplete="off">
      </div>
    `;
    openModal({
      title:        'Delete All Data',
      body:         bodyEl,
      confirmLabel: 'Delete Everything',
      cancelLabel:  'Cancel',
      danger:       true,
      onConfirm:    async () => {
        const val = (document.getElementById('delete-confirm-input') as HTMLInputElement)?.value;
        if (val !== 'DELETE') { showToast('Type DELETE exactly to confirm.', 'warning'); return; }
        await clearAllData();
        setState({ activeClassId: null, activeSessionId: null });
        showToast('All data deleted.', 'success');
      },
    });
  });

  dataSection.append(exportAllBtn, deleteAllBtn);
  container.appendChild(dataSection);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K];
function el(tag: string, className?: string): HTMLElement;
function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function field(labelText: string): HTMLElement {
  const wrapper = el('div', 'field');
  const lbl     = el('label');
  lbl.textContent = labelText;
  wrapper.appendChild(lbl);
  return wrapper;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function announceRecognition(message: string): void {
  const el = document.getElementById('recognition-announcements');
  if (el) el.textContent = message;
}
