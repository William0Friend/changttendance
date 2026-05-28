#!/usr/bin/env node
// Download face-api model files into public/models for offline builds

import fs from 'fs';
import path from 'path';

const BASE = process.env.CDN_MODEL_BASE || 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

const outDir = path.resolve(process.cwd(), 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });

async function download() {
  console.log('Downloading models from', BASE);
  for (const file of files) {
    const url = `${BASE}/${file}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const outPath = path.join(outDir, file);
      fs.writeFileSync(outPath, buf);
      console.log('Saved', outPath);
    } catch (e) {
      console.warn('Failed to download', url, e?.message || e);
    }
  }
  console.log('Done.');
}

download().catch((e) => { console.error(e); process.exit(1); });
