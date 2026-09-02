import { describe, expect, test } from '@jest/globals';

import {
  HCS25_SIGNAL_CATALOG,
  hcs25AcpMetricsSchema,
  hcs25AgentverseInsightsSchema,
  hcs25AvailabilityFieldsSchema,
  hcs25ChatbotArenaFieldsSchema,
  hcs25Erc8004FeedbackSummarySchema,
  hcs25EthosFieldsSchema,
  hcs25HuggingFaceEvalFieldsSchema,
  hcs25OpenLlmEvalFieldsSchema,
  hcs25OpenRouterEvalFieldsSchema,
  hcs25OutputVerificationSummarySchema,
  hcs25OssPopularityFieldsSchema,
  hcs25SimpleEvalFieldsSchema,
  hcs25X402UsageSummarySchema,
} from '../../src/hcs-25/signals';

describe('HCS-25 signal catalog coverage', () => {
  test('documents every signal family from the specification', () => {
    const expectedFamilies = [
      'availability',
      'ethos',
      'acp',
      'erc8004-feedback',
      'x402',
      'oss-popularity',
      'agentverse-insights',
      'agentverse-simple-evals',
      'a2a-simple-evals',
      'nanda-simple-evals',
      'simple-evals',
      'openrouter-evals',
      'chatbot-arena',
      'huggingface-model-index',
      'openllm-leaderboard',
      'output-verification',
    ];

    expect(Object.keys(HCS25_SIGNAL_CATALOG).sort()).toEqual(
      expectedFamilies.sort(),
    );
  });

  test('documents storage location and fields for each family', () => {
    for (const family of Object.values(HCS25_SIGNAL_CATALOG)) {
      expect(family.storage.length).toBeGreaterThan(0);
      expect(family.fields.length).toBeGreaterThan(0);
    }

    const feedback = HCS25_SIGNAL_CATALOG['erc8004-feedback'];
    expect(feedback.storage).toBe('metadata.erc8004FeedbackSummary');
    expect(feedback.fields).toContain('averageScore');
    expect(feedback.fields).toContain('totalFeedbacks');
  });
});

describe('HCS-25 signal schemas', () => {
  test('validates availability fields including ecosystem recency', () => {
    const parsed = hcs25AvailabilityFieldsSchema.safeParse({
      availabilityScore: 0.98,
      availabilityCheckedAt: '2026-01-14T00:00:00Z',
      availabilitySource: 'probe',
      metrics: { isOnline: true, minsFromLastOnline: 3 },
    });
    expect(parsed.success).toBe(true);

    const invalid = hcs25AvailabilityFieldsSchema.safeParse({
      availabilityScore: 'high',
    });
    expect(invalid.success).toBe(false);
  });

  test('validates ethos composite and per-source records', () => {
    const parsed = hcs25EthosFieldsSchema.safeParse({
      ethosUserkey: 'address:0xabc',
      ethosScore: 1500,
      ethosScoreStatus: 'ok',
      ethosComposite: { version: 1, score: 1500, weights: { address: 1 } },
      ethosSources: [
        {
          userkey: 'address:0xabc',
          kind: 'address',
          weight: 1,
          status: 'ok',
          score: 1500,
        },
      ],
    });
    expect(parsed.success).toBe(true);

    const invalid = hcs25EthosFieldsSchema.safeParse({
      ethosSources: [{ kind: 'friend' }],
    });
    expect(invalid.success).toBe(false);
  });

  test('validates ACP marketplace metrics', () => {
    const parsed = hcs25AcpMetricsSchema.safeParse({
      metrics: {
        successRate: 0.92,
        successfulJobCount: 46,
        totalJobCount: 50,
        volume: 120,
        revenue: 3000,
        rating: 4.6,
      },
    });
    expect(parsed.success).toBe(true);

    const invalid = hcs25AcpMetricsSchema.safeParse({
      metrics: { rating: 6 },
    });
    expect(invalid.success).toBe(false);
  });

  test('validates ERC-8004 feedback summaries', () => {
    const parsed = hcs25Erc8004FeedbackSummarySchema.safeParse({
      averageScore: 88,
      totalFeedbacks: 12,
      registry: 'erc-8004',
      network: 'base',
      updatedAt: '2026-01-14T00:00:00Z',
    });
    expect(parsed.success).toBe(true);

    const invalid = hcs25Erc8004FeedbackSummarySchema.safeParse({
      averageScore: 88,
      totalFeedbacks: -1,
    });
    expect(invalid.success).toBe(false);
  });

  test('validates x402 usage summaries', () => {
    const parsed = hcs25X402UsageSummarySchema.safeParse({
      volume7dUsd: 1200,
      volume24hUsd: 300,
      inboundTrades7d: 40,
      outboundTrades7d: 12,
    });
    expect(parsed.success).toBe(true);

    const invalid = hcs25X402UsageSummarySchema.safeParse({
      volume7dUsd: 'lots',
    });
    expect(invalid.success).toBe(false);
  });

  test('validates AgentVerse insights counters', () => {
    const parsed = hcs25AgentverseInsightsSchema.safeParse({
      agentverseInsightsRating: 4.2,
      agentverseInsightsReadmeQualityScore: 0.8,
      agentverseInsightsVerifierTotalInteractions: 150,
      agentverseInsightsVerifierTotalSuccessInteractions: 140,
      agentverseInsightsVerifierRecentInteractions: 20,
      agentverseInsightsVerifierRecentSuccessInteractions: 18,
      agentverseInsightsAvgResponseTime: 2.5,
    });
    expect(parsed.success).toBe(true);
  });

  test('validates OSS popularity fields', () => {
    const parsed = hcs25OssPopularityFieldsSchema.safeParse({
      githubRepo: 'octocat/hello',
      githubStars: 1200,
      packageRegistry: 'npm',
      packageName: 'hello',
      npmDownloads30d: 4500,
    });
    expect(parsed.success).toBe(true);
  });

  test('validates simple eval result fields', () => {
    const parsed = hcs25SimpleEvalFieldsSchema.safeParse({
      a2aSimpleMathScore: 100,
      a2aSimpleMathStatus: 'correct',
      a2aSimpleMathQuestionId: 'math:add:37+58',
      nandaSimpleScienceScore: 0,
      nandaSimpleScienceStatus: 'wrong',
    });
    expect(parsed.success).toBe(true);
  });

  test('validates model evaluation signal fields', () => {
    expect(
      hcs25OpenRouterEvalFieldsSchema.safeParse({
        openrouterEvalScore: 72,
        openrouterEvalStatus: 'ok',
        openrouterEvalMetricsCount: 3,
        openrouterEvalCategoryCount: 2,
        openrouterEvalCoverageWeight: 1200,
      }).success,
    ).toBe(true);

    expect(
      hcs25ChatbotArenaFieldsSchema.safeParse({
        chatbotArenaEvalScore: 60,
        chatbotArenaEvalElo: 1180,
        chatbotArenaEvalStatus: 'ok',
      }).success,
    ).toBe(true);

    expect(
      hcs25HuggingFaceEvalFieldsSchema.safeParse({
        huggingFaceModelId: 'org/model',
        huggingFaceEvalScore: 65,
        huggingFaceEvalMode: 'mixed',
        huggingFaceEvalStatus: 'ok',
      }).success,
    ).toBe(true);

    expect(
      hcs25OpenLlmEvalFieldsSchema.safeParse({
        openLlmEvalScore: 58,
        openLlmEvalMetricsCount: 4,
        openLlmEvalStatus: 'ok',
      }).success,
    ).toBe(true);
  });

  test('validates output verification summaries', () => {
    const parsed = hcs25OutputVerificationSummarySchema.safeParse({
      allowRate: 0.9,
      blockRate: 0.08,
      uncertainRate: 0.02,
      avgConfidence: 0.85,
      totalChecks: 240,
      windowDays: 7,
      updatedAt: '2026-01-14T00:00:00Z',
      stakeDistribution: {
        low: { checks: 200, allowRate: 0.95, avgConfidence: 0.9 },
        high: { checks: 40, allowRate: 0.7, avgConfidence: 0.75 },
      },
      providers: [
        {
          id: 'thoughtproof',
          signerAddress: '0xabc',
          methodologyUrl: 'https://example.com/method',
          checksContributed: 240,
        },
      ],
    });
    expect(parsed.success).toBe(true);

    const invalid = hcs25OutputVerificationSummarySchema.safeParse({
      allowRate: 1.5,
      totalChecks: -3,
    });
    expect(invalid.success).toBe(false);
  });
});
