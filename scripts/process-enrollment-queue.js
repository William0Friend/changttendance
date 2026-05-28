#!/usr/bin/env node
// Process enrollment queue using local API server (if available) or Supabase.
// Usage: set LOCAL_API_URL (e.g. http://localhost:3000/api) and optionally PROCESS_CLASS_ID

const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://localhost:3000/api';
const PROCESS_CLASS_ID = process.env.PROCESS_CLASS_ID || 'default-class';

async function run() {
  console.log('Processing enrollment queue using', LOCAL_API_URL, 'for class', PROCESS_CLASS_ID);

  try {
    const pendingRes = await fetch(`${LOCAL_API_URL}/enrollments/pending?classId=${encodeURIComponent(PROCESS_CLASS_ID)}`);
    const pendingJson = await pendingRes.json().catch(() => null);
    if (!pendingRes.ok || !pendingJson || !pendingJson.ok) {
      console.warn('No pending records or API not available:', pendingJson?.error || pendingRes.statusText);
      return;
    }

    const rows = pendingJson.data || [];
    console.log(`Found ${rows.length} pending enrollment(s)`);

    for (const row of rows) {
      try {
        console.log('Processing', row.id, row.student_name);
        // Download photo (not saved to disk permanently)
        const photoRes = await fetch(`${LOCAL_API_URL}/enrollments/${row.id}/photo`);
        if (!photoRes.ok) {
          console.warn('Failed to download photo for', row.id);
          continue;
        }
        const blob = await photoRes.blob();
        // TODO: Run local face processing or hand off to other worker.
        // For now, auto-approve every enrollment (demo only)
        const approveRes = await fetch(`${LOCAL_API_URL}/enrollments/${row.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        });
        const approveJson = await approveRes.json().catch(() => null);
        if (!approveRes.ok || !approveJson || !approveJson.ok) {
          console.warn('Failed to update status for', row.id);
          continue;
        }

        // Delete photo from server storage
        const delRes = await fetch(`${LOCAL_API_URL}/enrollments/photo?path=${encodeURIComponent(row.photo_path)}`, { method: 'DELETE' });
        if (!delRes.ok) {
          console.warn('Failed to delete photo for', row.id);
        }

        console.log('Approved', row.id);
      } catch (err) {
        console.warn('Error processing row', row.id, err?.message || err);
      }
    }
  } catch (err) {
    console.error('Failed to process queue:', err?.message || err);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
