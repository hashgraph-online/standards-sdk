import { describe, expect, test } from '@jest/globals';

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

describe('HCS-25 missing and stale data rules', () => {
  test('stale components are multiplied by the configured staleness multiplier', () => {
    const config = compileScoringConfig({
      version: 1,
      staleMultiplier: 0.5,
      adapters: [
        {
          id: 'popularity',
          components: [
            {
              name: 'stars',
              normalize: () => ({ value: 60, status: 'stale' }),
            },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['popularity.stars']).toBe(30);
  });

  test('stale components fall back to a default multiplier of one', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'popularity',
          components: [
            {
              name: 'stars',
              normalize: () => ({ value: 60, status: 'stale' }),
            },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['popularity.stars']).toBe(60);
  });

  test('missing, timeout, and error statuses are scored as zero', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'probes',
          components: [
            {
              name: 'missing_c',
              normalize: () => ({ value: 99, status: 'missing' }),
            },
            {
              name: 'timeout_c',
              normalize: () => ({ value: 99, status: 'timeout' }),
            },
            {
              name: 'error_c',
              normalize: () => ({ value: 99, status: 'error' }),
            },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['probes.missing_c']).toBe(0);
    expect(result.trustScores['probes.timeout_c']).toBe(0);
    expect(result.trustScores['probes.error_c']).toBe(0);
    expect(result.breakdown.adapters[0]?.total).toBe(0);
  });

  test('non-finite normalized values are treated as unavailable', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'broken',
          components: [
            {
              name: 'ratio',
              normalize: () => ({ value: Number.NaN, status: 'ok' }),
            },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['broken.ratio']).toBe(0);
  });

  test('component values are clamped into the 0-100 range', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'raw',
          components: [
            { name: 'high', normalize: () => ok(120) },
            { name: 'low', normalize: () => ok(-5) },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['raw.high']).toBe(100);
    expect(result.trustScores['raw.low']).toBe(0);
  });
});

describe('HCS-25 applicability and weights', () => {
  test('includeRegistries excludes the adapter and keeps it out of the denominator', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        singleComponentAdapter('anchor'),
        {
          ...singleComponentAdapter('marketplace-only'),
          includeRegistries: ['virtuals'],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    const marketplaceOnly = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'marketplace-only',
    );
    expect(marketplaceOnly?.applicable).toBe(false);
    expect(marketplaceOnly?.inDenominator).toBe(false);
    expect(result.trustScores['marketplace-only.score']).toBeUndefined();
    expect(result.trustScores.total).toBe(80);
  });

  test('excludeRegistries removes the adapter for the denied registry', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          ...singleComponentAdapter('ethos'),
          excludeRegistries: ['internal'],
        },
      ],
    });

    const excluded = computeTrustScore({
      subject: { id: 'agent:a', registry: 'internal' },
      snapshot: {},
      config,
    });
    expect(excluded.breakdown.adapters[0]?.applicable).toBe(false);
    expect(excluded.trustScores.total).toBe(0);

    const included = computeTrustScore({
      subject: { id: 'agent:a', registry: 'open' },
      snapshot: {},
      config,
    });
    expect(included.breakdown.adapters[0]?.applicable).toBe(true);
    expect(included.trustScores.total).toBe(80);
  });

  test('appliesTo predicates gate adapter participation', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        singleComponentAdapter('anchor'),
        {
          ...singleComponentAdapter('http-only'),
          appliesTo: probe => probe.protocol === 'http',
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['http-only.score']).toBeUndefined();
    expect(result.trustScores.total).toBe(80);
  });

  test('adapter weights default to one and act as pure coefficients', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        singleComponentAdapter('a'),
        singleComponentAdapter('b', { weight: 3 }),
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.breakdown.adapters[0]?.weight).toBe(1);
    expect(result.trustScores.total).toBe(80);
  });

  test('zero-weight adapters are informational only and excluded from the denominator', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'note',
          weight: 0,
          contributionMode: 'universal',
          components: [{ name: 'info', normalize: () => missing() }],
        },
        singleComponentAdapter('anchor', { weight: 1 }),
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    const note = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'note',
    );
    expect(note?.inDenominator).toBe(false);
    expect(note?.components[0]?.value).toBe(0);
    expect(result.trustScores.total).toBe(80);
  });

  test('empty denominator yields a composite score of zero', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          ...singleComponentAdapter('sparse'),
          appliesTo: probe => probe.id === 'other',
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores.total).toBe(0);
    expect(result.trustScore).toBe(0);
  });

  test('custom within-adapter weights keep deterministic totals in range', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'weighted',
          components: [
            { name: 'major', weight: 3, normalize: () => ok(100) },
            { name: 'minor', weight: 1, normalize: () => ok(0) },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.breakdown.adapters[0]?.total).toBe(75);
    expect(result.trustScores.total).toBe(75);
  });
});
