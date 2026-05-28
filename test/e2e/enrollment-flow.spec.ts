import { test, expect } from '@playwright/test';

test('student enrollment (online queue) and professor approval', async ({ page }) => {
  let pendingCalls = 0;

  // Intercept pending enrollments: first call returns one record, subsequent calls return empty
  await page.route('**/api/enrollments/pending**', async (route) => {
    pendingCalls++;
    if (pendingCalls === 1) {
      const body = {
        ok: true,
        data: [
          {
            id: 'enr-1',
            student_name: 'Alice Example',
            student_id: 'S12345',
            class_id: 'class-1',
            photo_path: 'photos/enr-1.jpg',
            submitted_at: new Date().toISOString(),
            status: 'pending',
          },
        ],
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    }
  });

  // Intercept photo download - return a small fake payload (app tolerates errors)
  await page.route('**/api/enrollments/*/photo', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: 'FAKEIMAGE' });
  });

  // Intercept delete photo
  await page.route('**/api/enrollments/photo**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Intercept update status
  await page.route('**/api/enrollments/*/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Start from the app root
  page.on('request', (req) => console.log('PAGE REQ:', req.method(), req.url()));
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  await page.goto('/');

  // Programmatically add a class to IndexedDB so the Enroll tab has a class ready.
  await page.goto('/');
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('changttendance', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('classes', 'readwrite');
        const store = tx.objectStore('classes');
        const rec = {
          id: 'class-1',
          name: 'E2E Test Class',
          code: 'E2E101',
          enrollmentCode: 'ENR1',
          createdAt: new Date().toISOString(),
        };
        store.put(rec);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
      };
      req.onerror = (e) => reject(e);
    });
  });

  // Go to Classes tab and verify class appears
  await page.getByRole('tab', { name: 'Classes' }).click();
  await expect(page.getByText('E2E101')).toBeVisible();

  // Go to Enroll Students -> Online Queue (auto-selects the first class)
  await page.getByRole('tab', { name: 'Enroll Students' }).click();
  await page.getByRole('button', { name: 'Online Queue' }).click();

  // Wait for the pending enrollment to load
  await expect(page.getByText('Alice Example')).toBeVisible();

  // Click Approve on the first queue item
  await page.locator('.queue-item').getByRole('button', { name: 'Approve' }).first().click();

  // After approving, the queue should refresh and show empty state
  await expect(page.getByText('No pending enrollments')).toBeVisible();
});
