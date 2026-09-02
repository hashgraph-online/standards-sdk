import { describe, expect, test } from '@jest/globals';

import type { Hcs25Subject } from '../../src/hcs-25/types';
import {
  compileScoringConfig,
  computeTrustScore,
} from '../../src/hcs-25/scoring';
import { createHcs25AdapterCatalog } from '../../src/hcs-25/adapters';

describe('HCS-25 adapter catalog', () => {
  test('contains every adapter documented in the specification', () => {
    const catalog = createHcs25AdapterCatalog();

    expect(catalog.map(adapter => adapter.id).sort()).toEqual(
      [
        'availability',
        'ethos',
        'acp',
        'erc8004-feedback',
        'x402',
        'oss-popularity',
        'simple-math',
        'simple-science',
        'agentverse-insights',
        'agentverse-verifier',
        'openrouter-evals',
        'chatbot-arena',
        'huggingface-model-index',
        'openllm-leaderboard',
        'model-tier',
        'output-verification',
        'connectivity',
      ].sort(),
    );
  });

  test('matches the suggested contribution modes and weights', () => {
    const catalog = createHcs25AdapterCatalog();

    const expected: Record<string, [string, number]> = {
      availability: ['universal', 1],
      ethos: ['universal', 1],
      acp: ['scoped', 2],
      'erc8004-feedback': ['scoped', 1],
      x402: ['scoped', 1],
      'oss-popularity': ['scoped', 0.7],
      'simple-math': ['scoped', 0.5],
      'simple-science': ['scoped', 0.5],
      'agentverse-insights': ['scoped', 1],
      'agentverse-verifier': ['conditional', 1],
      'openrouter-evals': ['scoped', 0.5],
      'chatbot-arena': ['scoped', 6],
      'huggingface-model-index': ['conditional', 0.8],
      'openllm-leaderboard': ['conditional', 1],
      'model-tier': ['conditional', 2],
      'output-verification': ['scoped', 1],
      connectivity: ['conditional', 1],
    };

    for (const adapter of catalog) {
      const [mode, weight] = expected[adapter.id];
      expect(adapter.contributionMode ?? 'conditional').toBe(mode);
      expect(adapter.weight ?? 1).toBe(weight);
    }
  });

  test('produces a configuration that passes compile-time validation', () => {
    expect(() =>
      compileScoringConfig({
        version: 1,
        adapters: createHcs25AdapterCatalog(),
      }),
    ).not.toThrow();
  });

  test('scores a full agent record end to end', () => {
    const subject: Hcs25Subject = {
      id: 'agent:av-demo',
      registry: 'agentverse',
      metadata: {
        availabilityScore: 0.9,
        additional: {
          agentverseInsightsRating: 4,
          agentverseInsightsVerifierRecentInteractions: 10,
          agentverseInsightsVerifierRecentSuccessInteractions: 9,
          agentverseInsightsAvgResponseTime: 0,
          a2aSimpleMathScore: 100,
          a2aSimpleMathStatus: 'correct',
        },
      },
    };

    const result = computeTrustScore({
      subject,
      snapshot: {},
      config: { version: 1, adapters: createHcs25AdapterCatalog() },
    });

    expect(result.trustScores['availability.uptime']).toBe(90);
    expect(result.trustScores['agentverse-insights.score']).toBe(80);
    expect(result.trustScores['simple-math.score']).toBe(100);
    expect(result.trustScores['simple-science.score']).toBe(0);
    expect(
      result.trustScores['agentverse-verifier.score'],
    ).toBeGreaterThanOrEqual(0);
    expect(result.trustScores['ethos.score']).toBeUndefined();
    expect(result.trustScores['acp.jobs.successRate']).toBeUndefined();
    expect(result.trustScores['model-tier.score']).toBeUndefined();

    const denominator = result.breakdown.adapters.filter(
      adapter => adapter.inDenominator,
    );
    const expectedTotal =
      denominator.reduce(
        (sum, adapter) => sum + adapter.total * adapter.weight,
        0,
      ) / denominator.reduce((sum, adapter) => sum + adapter.weight, 0);
    expect(result.trustScores.total).toBeCloseTo(
      Math.round(expectedTotal * 100) / 100,
      2,
    );
  });

  test('scores a model catalog record end to end', () => {
    const subject: Hcs25Subject = {
      id: 'model:demo',
      registry: 'openrouter',
      metadata: {
        additional: {
          openrouterModelId: 'openai/gpt-4o-mini',
          openrouterEvalScore: 80,
          openrouterEvalStatus: 'ok',
          chatbotArenaEvalScore: 60,
          chatbotArenaEvalStatus: 'ok',
          huggingFaceEvalScore: 55,
          huggingFaceEvalStatus: 'ok',
        },
      },
    };

    const result = computeTrustScore({
      subject,
      snapshot: {},
      config: { version: 1, adapters: createHcs25AdapterCatalog() },
    });

    expect(result.trustScores['openrouter-evals.score']).toBe(80);
    expect(result.trustScores['chatbot-arena.score']).toBe(60);
    expect(result.trustScores['huggingface-model-index.score']).toBe(55);
    expect(result.trustScores['availability.uptime']).toBeUndefined();
    expect(result.trustScores['model-tier.score']).toBeUndefined();
    expect(result.trustScores.total).toBeGreaterThan(0);
  });
});
