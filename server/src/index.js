import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const PORT = process.env.PORT || 3000;
const pool = new Pool({
  host: process.env.PGHOST || 'db',
  user: process.env.PGUSER || 'chang',
  password: process.env.PGPASSWORD || 'changpass',
  database: process.env.PGDATABASE || 'changttendance',
  port: Number(process.env.PGPORT) || 5432,
});

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');

fs.mkdirSync(PHOTO_DIR, { recursive: true });

const upload = multer({ dest: PHOTO_DIR, limits: { fileSize: 5 * 1024 * 1024 } });

// Health
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Submit enrollment
app.post('/api/enrollments', upload.single('photo'), async (req, res) => {
  try {
    const { studentName, studentId, email, classId } = req.body;
    if (!studentName || !studentId || !classId || !req.file) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }
    const id = randomUUID();
    const photoRelPath = `photos/${req.file.filename}`;
    const submittedAt = new Date().toISOString();

    const query = `
      INSERT INTO enrollment_queue (id, student_name, student_id, email, class_id, photo_path, submitted_at, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `;
    await pool.query(query, [id, studentName, studentId, email || null, classId, photoRelPath, submittedAt, 'pending']);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Get pending
app.get('/api/enrollments/pending', async (req, res) => {
  try {
    const classId = req.query.classId;
    if (!classId) return res.status(400).json({ ok: false, error: 'classId required' });
    const { rows } = await pool.query('SELECT id, student_name, student_id, email, class_id, photo_path, submitted_at, status FROM enrollment_queue WHERE class_id = $1 AND status = $2 ORDER BY submitted_at ASC', [classId, 'pending']);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Download photo by id
app.get('/api/enrollments/:id/photo', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await pool.query('SELECT photo_path FROM enrollment_queue WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Record not found' });
    const photoPath = path.join(DATA_DIR, rows[0].photo_path);
    if (!fs.existsSync(photoPath)) return res.status(404).json({ ok: false, error: 'Photo not found' });
    res.sendFile(photoPath);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Update status
app.post('/api/enrollments/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status' });
    await pool.query('UPDATE enrollment_queue SET status = $1 WHERE id = $2', [status, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Delete photo by id
app.delete('/api/enrollments/:id/photo', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await pool.query('SELECT photo_path FROM enrollment_queue WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Record not found' });
    const full = path.join(DATA_DIR, rows[0].photo_path);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Delete photo by path
app.delete('/api/enrollments/photo', async (req, res) => {
  try {
    const photoPath = req.query.path;
    if (!photoPath) return res.status(400).json({ ok: false, error: 'path query param required' });
    const full = path.join(DATA_DIR, photoPath);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return res.json({ ok: true });
    } else {
      return res.status(404).json({ ok: false, error: 'Photo not found' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Changttendance server listening on ${PORT}`);
});
