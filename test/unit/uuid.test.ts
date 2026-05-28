import { genUUID } from '../../src/utils/uuid';

describe('genUUID', () => {
  test('generates RFC4122 v4 UUIDs and uniqueness', () => {
    const ids = new Set<string>();
    const rx = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (let i = 0; i < 10; i++) {
      const id = genUUID();
      expect(rx.test(id)).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(10);
  });
});
