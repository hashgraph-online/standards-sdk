import { describe, expect, test } from '@jest/globals';

import type { Hcs25Subject } from '../../src/hcs-25/types';
import { computeTrustScore } from '../../src/hcs-25/scoring';
import {
  createAvailabilityAdapter,
  createConnectivityAdapter,
  createEthosAdapter,
  createOutputVerificationAdapter,
} from '../../src/hcs-25/adapters';

type AdapterDefinition = Parameters<
  typeof computeTrustScore
>[0]['config']['adapters'][number];

function scoreOne(
  adapter: AdapterDefinition,
  subject: Hcs25Subject,
): ReturnType<typeof computeTrustScore> {
  return computeTrustScore({
    subject,
    snapshot: {},
    config: { version: 1, adapters: [adapter] },
  });
}

describe('HCS-25 availability adapter', () => {
  test('normalizes ratio-scale availability scores', () => {
    const result = scoreOne(createAvailabilityAdapter(), {
      id: 'agent:a',
      metadata: { availabilityScore: 0.98 },
    });

    expect(result.trustScores['availability.uptime']).toBe(98);
  });

  test('accepts percent-scale scores without explicit configuration', () => {
    const result = scoreOne(createAvailabilityAdapter(), {
      id: 'agent:a',
      metadata: { availabilityScore: 90 },
    });

    expect(result.trustScores['availability.uptime']).toBe(90);
  });

  test('decays linearly over a 24-hour recency window', () => {
    const result = scoreOne(createAvailabilityAdapter(), {
      id: 'agent:a',
      metadata: {
        metrics: { isOnline: true, minsFromLastOnline: 720 },
      },
    });

    expect(result.trustScores['availability.uptime']).toBe(50);
  });

  test('treats offline agents without recency data as zero', () => {
    const offline = scoreOne(createAvailabilityAdapter(), {
      id: 'agent:a',
      metadata: { metrics: { isOnline: false } },
    });
    expect(offline.trustScores['availability.uptime']).toBe(0);

    const ancient = scoreOne(createAvailabilityAdapter(), {
      id: 'agent:a',
      metadata: { metrics: { minsFromLastOnline: 2880 } },
    });
    expect(ancient.trustScores['availability.uptime']).toBe(0);
  });

  test('rewards online agents with no other signal', () => {
    const result = scoreOne(createAvailabilityAdapter(), {
      id: 'agent:a',
      metadata: { metrics: { isOnline: true } },
    });

    expect(result.trustScores['availability.uptime']).toBe(100);
  });

  test('participates universally and penalizes total missingness with zero', () => {
    const adapter = createAvailabilityAdapter();
    expect(adapter.contributionMode).toBe('universal');
    expect(adapter.weight).toBe(1);

    const result = scoreOne(adapter, { id: 'agent:a', metadata: {} });
    expect(result.trustScores['availability.uptime']).toBe(0);
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(true);
  });

  test('excludes model catalog registries by default', () => {
    const result = scoreOne(createAvailabilityAdapter(), {
      id: 'model:a',
      registry: 'openrouter',
      metadata: { availabilityScore: 1 },
    });

    expect(result.breakdown.adapters[0]?.applicable).toBe(false);
    expect(result.trustScores.total).toBe(0);
  });
});

describe('HCS-25 ethos adapter', () => {
  test('maps raw ethos scores through the baseline and max anchors', () => {
    const result = scoreOne(createEthosAdapter(), {
      id: 'agent:a',
      metadata: {
        ethosComposite: { version: 1, score: 1600 },
        ethosScore: 900,
      },
    });

    expect(result.trustScores['ethos.score']).toBe(50);
  });

  test('falls back to the flat ethosScore field', () => {
    const result = scoreOne(createEthosAdapter(), {
      id: 'agent:a',
      metadata: { ethosScore: 2000 },
    });

    expect(result.trustScores['ethos.score']).toBe(100);
  });

  test('scores errored lookups as zero while remaining in the denominator', () => {
    const result = scoreOne(createEthosAdapter(), {
      id: 'agent:a',
      metadata: { ethosScore: null, ethosScoreStatus: 'error' },
    });

    expect(result.trustScores['ethos.score']).toBe(0);
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(true);
  });

  test('supports custom anchors and registry exclusions', () => {
    const adapter = createEthosAdapter({
      baselineScore: 0,
      maxScore: 100,
      maxContribution: 50,
    });
    const result = scoreOne(adapter, {
      id: 'agent:a',
      metadata: { ethosScore: 50 },
    });

    expect(result.trustScores['ethos.score']).toBe(25);
  });

  test('excludes registries where identity mapping is undefined', () => {
    const result = scoreOne(createEthosAdapter(), {
      id: 'agent:a',
      registry: 'agentverse',
      metadata: { ethosScore: 1500 },
    });

    expect(result.breakdown.adapters[0]?.applicable).toBe(false);
  });
});

describe('HCS-25 output verification adapter', () => {
  function summarySubject(summary: Record<string, unknown>): Hcs25Subject {
    return {
      id: 'agent:a',
      metadata: { outputVerificationSummary: summary },
    };
  }

  const baseSummary = {
    allowRate: 0.9,
    blockRate: 0.1,
    uncertainRate: 0,
    avgConfidence: 0.8,
    totalChecks: 10,
    windowDays: 7,
    stakeDistribution: {
      low: { checks: 8 },
      medium: { checks: 2 },
    },
  };

  test('computes quality from allow rate, confidence, and stake weighting', () => {
    const result = scoreOne(
      createOutputVerificationAdapter(),
      summarySubject(baseSummary),
    );

    expect(result.trustScores['output-verification.quality']).toBe(43.2);
  });

  test('computes log-scaled coverage with the volume cap', () => {
    const result = scoreOne(
      createOutputVerificationAdapter(),
      summarySubject(baseSummary),
    );

    const expectedCoverage =
      Math.round((100 * Math.min(50, Math.log10(11) * 20)) / 50 / 0.01) * 0.01;
    expect(result.trustScores['output-verification.coverage']).toBeCloseTo(
      expectedCoverage,
      2,
    );
  });

  test('weights the adapter total toward quality', () => {
    const result = scoreOne(
      createOutputVerificationAdapter(),
      summarySubject(baseSummary),
    );

    const quality = result.trustScores['output-verification.quality'];
    const coverage = result.trustScores['output-verification.coverage'];
    expect(result.breakdown.adapters[0]?.total).toBeCloseTo(
      0.7 * quality + 0.3 * coverage,
      2,
    );
  });

  test('penalizes rubber-stamp verifiers via discriminative power', () => {
    const result = scoreOne(
      createOutputVerificationAdapter(),
      summarySubject({ ...baseSummary, blockRate: 0 }),
    );

    expect(result.trustScores['output-verification.quality']).toBe(0);
  });

  test('grants full discriminative credit at a five percent block rate', () => {
    const result = scoreOne(
      createOutputVerificationAdapter(),
      summarySubject({ ...baseSummary, blockRate: 0.05 }),
    );

    expect(result.trustScores['output-verification.quality']).toBe(43.2);
  });

  test('scales quality by the stake multiplier without exceeding 1.5x', () => {
    const result = scoreOne(
      createOutputVerificationAdapter(),
      summarySubject({
        ...baseSummary,
        stakeDistribution: {
          critical: { checks: 10 },
        },
      }),
    );

    expect(result.trustScores['output-verification.quality']).toBe(100);
  });

  test('excludes agents below the minimum check threshold', () => {
    const adapter = createOutputVerificationAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(1);

    const result = scoreOne(
      adapter,
      summarySubject({ ...baseSummary, totalChecks: 9 }),
    );
    expect(result.breakdown.adapters[0]?.applicable).toBe(false);
    expect(result.trustScores.total).toBe(0);
  });

  test('is not applicable when no verification summary exists', () => {
    const result = scoreOne(createOutputVerificationAdapter(), {
      id: 'agent:a',
      metadata: {},
    });

    expect(result.breakdown.adapters[0]?.applicable).toBe(false);
  });
});

describe('HCS-25 connectivity adapter', () => {
  test('scores a single stored probe result', () => {
    const result = scoreOne(createConnectivityAdapter(), {
      id: 'agent:a',
      metadata: { additional: { connectivityScore: 85 } },
    });

    expect(result.trustScores['connectivity.score']).toBe(85);
  });

  test('clamps probe results into range', () => {
    const result = scoreOne(createConnectivityAdapter(), {
      id: 'agent:a',
      metadata: { additional: { connectivityScore: 130 } },
    });

    expect(result.trustScores['connectivity.score']).toBe(100);
  });

  test('emits one component per declared probe target', () => {
    const result = scoreOne(
      createConnectivityAdapter({ targets: ['agentverse', 'mcp'] }),
      {
        id: 'agent:a',
        metadata: {
          additional: { connectivityTargets: { agentverse: 90, mcp: 40 } },
        },
      },
    );

    expect(result.trustScores['connectivity.agentverse']).toBe(90);
    expect(result.trustScores['connectivity.mcp']).toBe(40);
  });

  test('is conditional and omitted without probe results', () => {
    const adapter = createConnectivityAdapter();
    expect(adapter.contributionMode).toBe('conditional');

    const result = scoreOne(adapter, { id: 'agent:a', metadata: {} });
    expect(result.trustScores['connectivity.score']).toBeUndefined();
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(false);
  });

  test('excludes model catalog registries by default', () => {
    const result = scoreOne(createConnectivityAdapter(), {
      id: 'model:a',
      registry: 'near-ai',
      metadata: { additional: { connectivityScore: 100 } },
    });

    expect(result.breakdown.adapters[0]?.applicable).toBe(false);
  });
});
