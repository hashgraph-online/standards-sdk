import { describe, expect, test } from '@jest/globals';

import {
  hcs25SignalSchema,
  hcs25SignalSnapshotSchema,
  hcs25SubjectSchema,
} from '../../src/hcs-25/types';

describe('HCS-25 signal schemas', () => {
  test('accepts a valid signal with provenance', () => {
    const parsed = hcs25SignalSchema.safeParse({
      status: 'ok',
      value: 42,
      fetchedAt: '2026-01-15T10:30:00.000Z',
      provenance: {
        source: 'example-leaderboard',
        sourceUrl: 'https://example.com/leaderboard',
        subjectId: 'example-agent',
        params: { window: '30d' },
      },
    });

    expect(parsed.success).toBe(true);
  });

  test('accepts structured json signal values', () => {
    const parsed = hcs25SignalSchema.safeParse({
      status: 'ok',
      value: { rating: 4.5, count: [1, 2, { nested: null }] },
    });

    expect(parsed.success).toBe(true);
  });

  test('rejects unknown status codes', () => {
    const parsed = hcs25SignalSchema.safeParse({ status: 'expired', value: 1 });

    expect(parsed.success).toBe(false);
  });

  test('validates snapshot keys against signal identifier namespacing', () => {
    const valid = hcs25SignalSnapshotSchema.safeParse({
      'availability.uptime': { status: 'ok', value: 1 },
    });
    expect(valid.success).toBe(true);

    const invalid = hcs25SignalSnapshotSchema.safeParse({
      uptime: { status: 'ok', value: 1 },
    });
    expect(invalid.success).toBe(false);
  });

  test('validates subject records', () => {
    const parsed = hcs25SubjectSchema.safeParse({
      id: 'agent:example',
      registry: 'virtuals',
      protocol: 'http',
      class: 'agent',
    });

    expect(parsed.success).toBe(true);

    const missingId = hcs25SubjectSchema.safeParse({ registry: 'virtuals' });
    expect(missingId.success).toBe(false);
  });
});
