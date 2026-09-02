import { describe, expect, test } from '@jest/globals';

import type { Hcs25Subject } from '../../src/hcs-25/types';
import { computeTrustScore } from '../../src/hcs-25/scoring';
import {
  createAcpAdapter,
  createAgentverseInsightsAdapter,
  createAgentverseVerifierAdapter,
  createErc8004FeedbackAdapter,
  createX402Adapter,
} from '../../src/hcs-25/adapters';

const subject: Hcs25Subject = { id: 'agent:x', registry: 'erc-8004' };

function scoreOne(
  adapter: Parameters<
    typeof computeTrustScore
  >[0]['config']['adapters'][number],
  scoringSubject: Hcs25Subject,
): ReturnType<typeof computeTrustScore> {
  return computeTrustScore({
    subject: scoringSubject,
    snapshot: {},
    config: { version: 1, adapters: [adapter] },
  });
}

describe('HCS-25 ACP adapter', () => {
  const acpSubject: Hcs25Subject = {
    id: 'agent:acp',
    registry: 'virtuals-protocol',
    metadata: {
      metrics: {
        successRate: 0.9,
        successfulJobCount: 45,
        totalJobCount: 50,
        volume: 120,
        revenue: 3000,
        rating: 4,
      },
    },
  };

  test('normalizes marketplace metrics into four components', () => {
    const result = scoreOne(createAcpAdapter(), acpSubject);

    expect(result.trustScores['acp.jobs.successRate']).toBe(90);
    expect(result.trustScores['acp.reviews.rating']).toBe(80);
    expect(result.trustScores['acp.jobs.deliveryVolume']).toBeCloseTo(
      (100 * Math.log1p(120)) / Math.log1p(500),
      2,
    );
    expect(result.trustScores['acp.jobs.revenue']).toBeCloseTo(
      (100 * Math.log1p(3000)) / Math.log1p(10000),
      2,
    );
  });

  test('accepts percent-scale success rates and falls back to job counts', () => {
    const result = scoreOne(createAcpAdapter(), {
      ...acpSubject,
      metadata: {
        metrics: { successRate: 90, successfulJobCount: 30 },
      },
    });

    expect(result.trustScores['acp.jobs.successRate']).toBe(90);
    expect(result.trustScores['acp.jobs.deliveryVolume']).toBeCloseTo(
      (100 * Math.log1p(30)) / Math.log1p(500),
      2,
    );
    expect(result.trustScores['acp.jobs.revenue']).toBe(0);
  });

  test('defaults to scoped contribution with weight two', () => {
    const adapter = createAcpAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(2);
  });
});

describe('HCS-25 ERC-8004 feedback adapter', () => {
  function feedbackSubject(
    averageScore: number,
    totalFeedbacks: number,
  ): Hcs25Subject {
    return {
      id: 'agent:erc',
      registry: 'erc-8004',
      metadata: {
        erc8004FeedbackSummary: {
          averageScore,
          totalFeedbacks,
          registry: 'erc-8004',
          network: 'base',
        },
      },
    };
  }

  test('passes through ratings and log-scales volume', () => {
    const result = scoreOne(
      createErc8004FeedbackAdapter(),
      feedbackSubject(88, 10),
    );

    expect(result.trustScores['erc8004-feedback.rating']).toBe(88);
    expect(result.trustScores['erc8004-feedback.volume']).toBe(
      Math.round(((100 * Math.min(20, Math.log10(11) * 10)) / 20) * 100) / 100,
    );
  });

  test('caps volume at full credit once feedback is plentiful', () => {
    const result = scoreOne(
      createErc8004FeedbackAdapter(),
      feedbackSubject(70, 1000),
    );

    expect(result.trustScores['erc8004-feedback.volume']).toBe(100);
  });

  test('clamps ratings into range and zeroes missing summaries', () => {
    const overflowing = scoreOne(
      createErc8004FeedbackAdapter(),
      feedbackSubject(140, 5),
    );
    expect(overflowing.trustScores['erc8004-feedback.rating']).toBe(100);

    const empty = scoreOne(createErc8004FeedbackAdapter(), {
      id: 'agent:erc',
      registry: 'erc-8004',
      metadata: {},
    });
    expect(empty.trustScores['erc8004-feedback.rating']).toBe(0);
    expect(empty.trustScores['erc8004-feedback.volume']).toBe(0);
    expect(empty.trustScores.total).toBe(0);
  });
});

describe('HCS-25 x402 adapter', () => {
  const x402Subject: Hcs25Subject = {
    id: 'agent:x402',
    metadata: {
      payTo: '0xabc',
      x402UsageSummary: {
        volume7dUsd: 1000,
        volume24hUsd: 100,
        inboundTrades7d: 30,
        outboundTrades7d: 20,
      },
    },
  };

  test('log-scales volume and trade counters', () => {
    const result = scoreOne(createX402Adapter(), x402Subject);

    expect(result.trustScores['x402.volume7d']).toBeCloseTo(
      (100 * Math.log1p(1000)) / Math.log1p(10000),
      2,
    );
    expect(result.trustScores['x402.trades7d']).toBeCloseTo(
      (100 * Math.log1p(50)) / Math.log1p(500),
      2,
    );
  });

  test('only applies to subjects with x402 configuration', () => {
    const withoutConfig = scoreOne(createX402Adapter(), {
      id: 'agent:plain',
      metadata: {},
    });
    expect(withoutConfig.breakdown.adapters[0]?.applicable).toBe(false);
    expect(withoutConfig.trustScores.total).toBe(0);
  });
});

describe('HCS-25 AgentVerse adapters', () => {
  const insightsSubject: Hcs25Subject = {
    id: 'agent:av',
    registry: 'agentverse',
    metadata: {
      additional: {
        agentverseInsightsRating: 4,
        agentverseInsightsReadmeQualityScore: 0.7,
        agentverseInsightsReadmeUniquenessScore: 0.5,
        agentverseInsightsInteractionsScore: 0.9,
        agentverseInsightsVerifierTotalInteractions: 100,
        agentverseInsightsVerifierTotalSuccessInteractions: 90,
        agentverseInsightsVerifierRecentInteractions: 10,
        agentverseInsightsVerifierRecentSuccessInteractions: 8,
        agentverseInsightsAvgResponseTime: 3,
      },
    },
  };

  test('insights adapter prefers the explicit rating scaled from five', () => {
    const result = scoreOne(createAgentverseInsightsAdapter(), insightsSubject);

    expect(result.trustScores['agentverse-insights.score']).toBe(80);
  });

  test('insights adapter falls back to the mean of available proxies', () => {
    const result = scoreOne(createAgentverseInsightsAdapter(), {
      ...insightsSubject,
      metadata: {
        additional: {
          agentverseInsightsReadmeQualityScore: 0.6,
          agentverseInsightsInteractionsScore: 0.8,
        },
      },
    });

    expect(result.trustScores['agentverse-insights.score']).toBe(70);
  });

  test('verifier adapter scores success rate with response-time and volume factors', () => {
    const result = scoreOne(createAgentverseVerifierAdapter(), insightsSubject);

    const successRate = (8 / 10) * 100;
    const responseFactor = Math.max(0, 1 - 3 / 30);
    const volumeFactor = Math.log1p(10) / Math.log1p(1000);
    const expected = successRate * responseFactor * volumeFactor;

    expect(result.trustScores['agentverse-verifier.score']).toBeCloseTo(
      expected,
      2,
    );
  });

  test('verifier adapter is conditional and omits agents without counters', () => {
    const adapter = createAgentverseVerifierAdapter();
    expect(adapter.contributionMode).toBe('conditional');

    const result = scoreOne(createAgentverseVerifierAdapter(), {
      ...insightsSubject,
      metadata: { additional: {} },
    });
    expect(result.trustScores['agentverse-verifier.score']).toBeUndefined();
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(false);
  });
});
