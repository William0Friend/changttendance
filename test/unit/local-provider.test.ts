import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalApiProvider } from '../../src/provider/local';

describe('LocalApiProvider', () => {
  const base = 'http://localhost:3000/api';
  let provider: LocalApiProvider;

  beforeEach(() => {
    provider = new LocalApiProvider(base);
    // reset fetch mock
    // @ts-ignore
    global.fetch = vi.fn();
  });

  it('submitEnrollment posts form and returns id', async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: 'abc' }) });
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const res = await provider.submitEnrollment('Jane', 'S123', 'a@b.com', 'class-1', blob);
    expect(res.ok).toBe(true);
    expect(res.data).toBe('abc');
  });

  it('getPendingEnrollments maps server rows', async () => {
    const serverRows = [{ id: '1', student_name: 'A', student_id: 'S1', class_id: 'c', photo_path: 'photos/x', submitted_at: '2020-01-01', status: 'pending' }];
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: serverRows }) });
    const res = await provider.getPendingEnrollments('c');
    expect(res.ok).toBe(true);
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].photoPath).toBe('photos/x');
  });

  it('importEnrollment returns blob', async () => {
    const fakeBuf = new Uint8Array([1,2,3]);
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, blob: async () => new Blob([fakeBuf]) });
    const res = await provider.importEnrollment('1');
    expect(res.ok).toBe(true);
    expect(res.data).toBeInstanceOf(Blob);
  });

  it('deletePhoto calls delete endpoint and returns ok', async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const res = await provider.deletePhoto('photos/x');
    expect(res.ok).toBe(true);
  });
});
