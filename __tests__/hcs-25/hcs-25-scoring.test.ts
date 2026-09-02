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

describe('HCS-25 test vectors', () => {
  test('test vector 1: missingness penalized under scoped contribution', () => {
    const config = compileScoringConfig({
      version: 1,
      staleMultiplier: 1,
      adapters: [
        {
          id: 'availability',
          weight: 1,
          contributionMode: 'scoped',
          components: [{ name: 'uptime', normalize: () => ok(90) }],
        },
        {
          id: 'simple-evals',
          weight: 2,
          contributionMode: 'scoped',
          components: [
            { name: 'math', normalize: () => ok(100) },
            { name: 'science', normalize: () => missing() },
          ],
        },
        {
          id: 'reputation',
          weight: 1,
          contributionMode: 'scoped',
          components: [{ name: 'stars', normalize: () => ok(40) }],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['availability.uptime']).toBe(90);
    expect(result.trustScores['simple-evals.math']).toBe(100);
    expect(result.trustScores['simple-evals.science']).toBe(0);
    expect(result.trustScores['reputation.stars']).toBe(40);
    expect(result.trustScores.total).toBe(57.5);
    expect(result.trustScore).toBe(57.5);
    expect(result.trustScoreConfigVersion).toBe(1);
    expect(typeof result.trustScoreUpdatedAt).toBe('string');

    const simpleEvals = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'simple-evals',
    );
    expect(simpleEvals?.total).toBe(50);
    expect(simpleEvals?.inDenominator).toBe(true);
  });

  test('test vector 2: sparse signals do not bias under conditional contribution', () => {
    const config = compileScoringConfig({
      version: 1,
      staleMultiplier: 1,
      adapters: [
        {
          id: 'availability',
          weight: 1,
          contributionMode: 'scoped',
          components: [{ name: 'uptime', normalize: () => ok(90) }],
        },
        {
          id: 'simple-evals',
          weight: 2,
          contributionMode: 'scoped',
          components: [
            { name: 'math', normalize: () => ok(100) },
            { name: 'science', normalize: () => missing() },
          ],
        },
        {
          id: 'reputation',
          weight: 1,
          contributionMode: 'conditional',
          components: [
            {
              name: 'stars',
              nonScorableWhenUnavailable: true,
              normalize: () => missing(),
            },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['reputation.stars']).toBeUndefined();
    expect(result.trustScores.total).toBe(63.33);
    expect(result.trustScore).toBe(63.33);

    const reputation = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'reputation',
    );
    expect(reputation?.inDenominator).toBe(false);
    expect(reputation?.unavailable).toEqual(['reputation.stars']);
  });
});

describe('HCS-25 contribution modes', () => {
  test('universal adapter with no output contributes a deterministic zero via default component key', () => {
    const config = compileScoringConfig({
      version: 3,
      adapters: [
        singleComponentAdapter('connectivity', {
          contributionMode: 'universal',
          producesOutput: false,
        }),
        singleComponentAdapter('coverage', {
          contributionMode: 'universal',
          nonScorableWhenUnavailable: true,
          producesOutput: false,
        }),
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    const connectivity = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'connectivity',
    );
    expect(connectivity?.components).toEqual([
      { key: 'connectivity.score', value: 0, status: 'missing', weight: 1 },
    ]);
    expect(connectivity?.inDenominator).toBe(true);
    expect(connectivity?.total).toBe(0);

    const coverage = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'coverage',
    );
    expect(coverage?.components).toEqual([
      { key: 'coverage.score', value: 0, status: 'missing', weight: 1 },
    ]);
    expect(result.trustScores.total).toBe(0);
  });

  test('scoped adapter uses its explicit defaultComponentKey when it produces no output', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        {
          id: 'acp',
          weight: 1,
          contributionMode: 'scoped',
          defaultComponentKey: 'acp.job_success',
          components: [
            {
              name: 'job_success',
              nonScorableWhenUnavailable: true,
              normalize: () => ({ value: 0, status: 'timeout' }),
            },
          ],
        },
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    expect(result.trustScores['acp.job_success']).toBe(0);
    expect(result.breakdown.adapters[0]?.components[0]?.status).toBe('missing');
    expect(result.trustScores.total).toBe(0);
  });

  test('conditional is the default contribution mode and is excluded when empty', () => {
    const config = compileScoringConfig({
      version: 1,
      adapters: [
        singleComponentAdapter('anchor', { weight: 2 }),
        singleComponentAdapter('sparse', {
          nonScorableWhenUnavailable: true,
          producesOutput: false,
        }),
      ],
    });

    const result = computeTrustScore({ subject, snapshot: {}, config });

    const sparse = result.breakdown.adapters.find(
      adapter => adapter.adapterId === 'sparse',
    );
    expect(sparse?.contributionMode).toBe('conditional');
    expect(sparse?.inDenominator).toBe(false);
    expect(result.trustScores.total).toBe(80);
  });
});
