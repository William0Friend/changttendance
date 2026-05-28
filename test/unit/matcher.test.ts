import { describe, it, expect, beforeEach } from 'vitest';

import {
  createMatcherState,
  recordMatch,
  clearStreak,
  isConfirmed,
  getConsecutiveCount,
  buildMatcher,
  matchDescriptor,
} from '../../src/recognition/matcher';

// Provide a minimal mock of the global faceapi used by the matcher module
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).faceapi = {
    LabeledFaceDescriptors: class LabeledFaceDescriptors {
      label: string;
      descriptors: Float32Array[];
      constructor(label: string, descriptors: Float32Array[]) {
        this.label = label;
        this.descriptors = descriptors;
      }
    },
    FaceMatcher: class FaceMatcher {
      labeled: any[];
      threshold: number;
      constructor(labeled: any[], threshold: number) {
        this.labeled = labeled;
        this.threshold = threshold;
      }
      findBestMatch(descriptor: Float32Array) {
        // Very small deterministic mock: if descriptor[0] === 0.1 -> s1, else unknown
        if (Math.abs((descriptor[0] ?? 0) - 0.1) < 1e-6) return { label: 's1', distance: 0.5 };
        return { label: 'unknown', distance: 1.0 };
      }
    },
  };
});

describe('Matcher temporal logic', () => {
  it('records consecutive matches and confirms after threshold', () => {
    const state = createMatcherState(0.6);
    // Should start unconfirmed
    expect(isConfirmed(state, 's1')).toBe(false);
    expect(getConsecutiveCount(state, 's1')).toBe(0);

    // First match
    let r = recordMatch(state, 's1');
    expect(r.justConfirmed).toBe(false);
    expect(r.consecutiveCount).toBe(1);
    expect(getConsecutiveCount(state, 's1')).toBe(1);

    // Second match
    r = recordMatch(state, 's1');
    expect(r.justConfirmed).toBe(false);
    expect(r.consecutiveCount).toBe(2);

    // Third match -> should confirm
    r = recordMatch(state, 's1');
    expect(r.justConfirmed).toBe(true);
    expect(r.consecutiveCount).toBe(3);
    expect(isConfirmed(state, 's1')).toBe(true);

    // Clearing streak does not un-confirm (confirmed set is persistent)
    clearStreak(state, 's1');
    expect(getConsecutiveCount(state, 's1')).toBe(0);
    expect(isConfirmed(state, 's1')).toBe(true);
  });
});

describe('Matcher build and descriptor matching', () => {
  it('builds matcher and matches descriptors', () => {
    const state = createMatcherState(0.6);
    const descriptorsByStudent = new Map<string, Float32Array[]>();
    descriptorsByStudent.set('s1', [new Float32Array([0.1])]);

    buildMatcher(descriptorsByStudent, state);
    // matchDescriptor should return the mocked label
    const res = matchDescriptor(state, new Float32Array([0.1]));
    expect(res).not.toBeNull();
    expect(res?.label).toBe('s1');

    // unknown descriptor -> null
    const res2 = matchDescriptor(state, new Float32Array([0.9]));
    expect(res2).toBeNull();
  });
});
