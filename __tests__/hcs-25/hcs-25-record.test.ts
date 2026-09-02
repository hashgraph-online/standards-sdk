import { describe, expect, test } from '@jest/globals';

import type { Hcs25SignalSnapshot } from '../../src/hcs-25/types';
import {
  computeTrustScore,
  compileScoringConfig,
} from '../../src/hcs-25/scoring';
import {
  missing,
  ok,
  singleComponentAdapter,
  subject,
} from './hcs-25-test-utils';

describe('HCS-25 result record and confidence', () => {
  test('reports trustScores.total, config version, and timestamp', () => {
    const config = compileScoringConfig({
      version: 7,
      adapters: [singleComponentAdapter('anchor')],
    });
    const now = new Date('2026-01-15T10:30:00.000Z');

    const result = computeTrustScore({ subject, snapshot: {}, config, now });

    expect(result.trustScores.total).toBe(80);
    expect(result.trustScoreConfigVersion).toBe(7);
    expect(result.trustScoreUpdatedAt).toBe('2026-01-15T10:30:00.000Z');
  });

  test('computes optional confidence from the fraction of ok components', () => {
    const config = compileScoringConfig({
      version: 1,
      computeConfidence: true,
      adapters: [
        {
          id: 'evals',
          weight: 1,
          components: [
            { name: 'math', normalize: () => ok(100) },
            { name: 'science', normalize: () => missing() },
          ],
        },
        singleComponentAdapter('anchor', { weight: 3 }),
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustConfidence).toBe(0.875);
  });

  test('omits confidence by default', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [singleComponentAdapter('anchor')],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustConfidence).toBeUndefined();
  });

  test('same inputs produce identical records', () => {
    const snapshot: Hcs25SignalSnapshot = {
      'availability.uptime': { status: 'ok', value: 0.9 },
    };
    const config = compileScoringConfig({
      version: 2,
      adapters: [singleComponentAdapter('anchor')],
    });
    const now = new Date('2026-02-01T00:00:00.000Z');

    const first = computeTrustScore({ subject, snapshot, config, now });
    const second = computeTrustScore({ subject, snapshot, config, now });

    expect(second).toEqual(first);
  });
});

describe('HCS-25 configuration validation', () => {
  test('rejects adapter ids that violate the namespace pattern', () => {
    expect(() =>
      compileScoringConfig({
        version: 1,
        adapters: [singleComponentAdapter('Bad Adapter')],
      }),
    ).toThrow(/adapterId/i);
  });

  test('rejects duplicate adapter ids within one configuration', () => {
    expect(() =>
      compileScoringConfig({
        version: 1,
        adapters: [
          singleComponentAdapter('dup'),
          singleComponentAdapter('dup'),
        ],
      }),
    ).toThrow(/unique|duplicate/i);
  });

  test('rejects negative weights', () => {
    expect(() =>
      compileScoringConfig({
        version: 1,
        adapters: [singleComponentAdapter('weighted', { weight: -1 })],
      }),
    ).toThrow(/weight/i);
  });

  test('rejects adapters without components', () => {
    expect(() =>
      compileScoringConfig({
        version: 1,
        adapters: [{ id: 'empty', components: [] }],
      }),
    ).toThrow(/component/i);
  });

  test('rejects invalid defaultComponentKey overrides', () => {
    expect(() =>
      compileScoringConfig({
        version: 1,
        adapters: [
          {
            id: 'acp',
            defaultComponentKey: 'not a key',
            components: [{ name: 'score', normalize: () => ok(50) }],
          },
        ],
      }),
    ).toThrow(/defaultComponentKey/i);
  });

  test('rejects snapshot keys that violate signal identifier namespacing', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [singleComponentAdapter('anchor')],
    });

    expect(() =>
      computeTrustScore({
        subject,
        snapshot: { uptime: { status: 'ok', value: 1 } },
        config,
      }),
    ).toThrow(/signal/i);
  });
});
