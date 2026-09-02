import { describe, expect, test } from '@jest/globals';

import type { Hcs25Subject } from '../../src/hcs-25/types';
import { computeTrustScore } from '../../src/hcs-25/scoring';
import {
  createChatbotArenaAdapter,
  createHuggingFaceModelIndexAdapter,
  createModelTierAdapter,
  createOpenLlmLeaderboardAdapter,
  createOpenRouterEvalsAdapter,
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

const modelSubject: Hcs25Subject = {
  id: 'model:a',
  registry: 'openrouter',
  metadata: { additional: {} },
};

describe('HCS-25 OpenRouter evals adapter', () => {
  test('passes through ok benchmark scores', () => {
    const result = scoreOne(createOpenRouterEvalsAdapter(), {
      ...modelSubject,
      metadata: {
        additional: {
          openrouterEvalScore: 72,
          openrouterEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['openrouter-evals.score']).toBe(72);
  });

  test('down-weights low-coverage benchmark scores', () => {
    const result = scoreOne(createOpenRouterEvalsAdapter(), {
      ...modelSubject,
      metadata: {
        additional: {
          openrouterEvalScore: 72,
          openrouterEvalStatus: 'low-coverage',
        },
      },
    });

    expect(result.trustScores['openrouter-evals.score']).toBe(36);
  });

  test('penalizes missing benchmark coverage with zero', () => {
    const adapter = createOpenRouterEvalsAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(0.5);

    const result = scoreOne(adapter, modelSubject);
    expect(result.trustScores['openrouter-evals.score']).toBe(0);
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(true);
  });
});

describe('HCS-25 chatbot arena adapter', () => {
  test('exposes normalized arena scores at the suggested weight', () => {
    const adapter = createChatbotArenaAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(6);

    const result = scoreOne(adapter, {
      ...modelSubject,
      metadata: {
        additional: {
          chatbotArenaEvalScore: 60,
          chatbotArenaEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['chatbot-arena.score']).toBe(60);
  });

  test('scores missing arena entries as zero under scoped contribution', () => {
    const result = scoreOne(createChatbotArenaAdapter(), modelSubject);

    expect(result.trustScores['chatbot-arena.score']).toBe(0);
  });
});

describe('HCS-25 Hugging Face model index adapter', () => {
  test('scores normalized model-index results', () => {
    const result = scoreOne(createHuggingFaceModelIndexAdapter(), {
      ...modelSubject,
      metadata: {
        additional: {
          huggingFaceEvalScore: 65,
          huggingFaceEvalMode: 'model-index',
          huggingFaceEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['huggingface-model-index.score']).toBe(65);
  });

  test('accepts the ingest-pipeline score alias', () => {
    const result = scoreOne(createHuggingFaceModelIndexAdapter(), {
      ...modelSubject,
      metadata: {
        additional: {
          huggingFaceSignalScore: 40,
          huggingFaceEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['huggingface-model-index.score']).toBe(40);
  });

  test('is conditional and omitted when coverage is missing or errored', () => {
    const adapter = createHuggingFaceModelIndexAdapter();
    expect(adapter.contributionMode).toBe('conditional');
    expect(adapter.weight).toBe(0.8);

    const missing = scoreOne(adapter, {
      ...modelSubject,
      metadata: {
        additional: {
          huggingFaceEvalScore: 65,
          huggingFaceEvalMode: 'missing',
          huggingFaceEvalStatus: 'missing',
        },
      },
    });
    expect(
      missing.trustScores['huggingface-model-index.score'],
    ).toBeUndefined();
    expect(missing.breakdown.adapters[0]?.inDenominator).toBe(false);

    const errored = scoreOne(adapter, {
      ...modelSubject,
      metadata: {
        additional: { huggingFaceEvalStatus: 'error' },
      },
    });
    expect(errored.breakdown.adapters[0]?.inDenominator).toBe(false);
  });
});

describe('HCS-25 Open LLM leaderboard adapter', () => {
  test('scores leaderboard entries when present', () => {
    const result = scoreOne(createOpenLlmLeaderboardAdapter(), {
      ...modelSubject,
      metadata: {
        additional: {
          openLlmEvalScore: 58,
          openLlmEvalMetricsCount: 4,
          openLlmEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['openllm-leaderboard.score']).toBe(58);
  });

  test('is conditional with weight one and omitted when missing', () => {
    const adapter = createOpenLlmLeaderboardAdapter();
    expect(adapter.contributionMode).toBe('conditional');
    expect(adapter.weight).toBe(1);

    const result = scoreOne(adapter, modelSubject);
    expect(result.trustScores['openllm-leaderboard.score']).toBeUndefined();
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(false);
  });
});

describe('HCS-25 model tier adapter', () => {
  const tiers = [
    { score: 95, patterns: ['gpt-5', 'claude-opus-4'] },
    { score: 70, patterns: ['gpt-4o', 'llama-4-scout'] },
  ];

  test('emits a heuristic tier score for sparse-coverage models', () => {
    const result = scoreOne(createModelTierAdapter({ tiers }), {
      ...modelSubject,
      metadata: {
        additional: {
          openrouterModelId: 'openai/gpt-4o-mini',
          openrouterEvalStatus: 'low-coverage',
        },
      },
    });

    expect(result.trustScores['model-tier.score']).toBe(70);
  });

  test('suppresses the fallback when benchmark coverage is sufficient', () => {
    const result = scoreOne(createModelTierAdapter({ tiers }), {
      ...modelSubject,
      metadata: {
        additional: {
          openrouterModelId: 'openai/gpt-4o-mini',
          openrouterEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['model-tier.score']).toBeUndefined();
    expect(result.breakdown.adapters[0]?.inDenominator).toBe(false);
  });

  test('suppresses the fallback when another external eval exists', () => {
    const result = scoreOne(createModelTierAdapter({ tiers }), {
      ...modelSubject,
      metadata: {
        additional: {
          openrouterModelId: 'openai/gpt-4o-mini',
          openrouterEvalStatus: 'missing',
          chatbotArenaEvalStatus: 'ok',
        },
      },
    });

    expect(result.trustScores['model-tier.score']).toBeUndefined();
  });

  test('falls back to a neutral score for unknown model identifiers', () => {
    const result = scoreOne(createModelTierAdapter({ tiers }), {
      ...modelSubject,
      metadata: {
        additional: {
          openrouterModelId: 'acme/quantum-llm',
          openrouterEvalStatus: 'missing',
        },
      },
    });

    expect(result.trustScores['model-tier.score']).toBe(50);
  });

  test('defaults to conditional contribution at weight two', () => {
    const adapter = createModelTierAdapter();
    expect(adapter.contributionMode).toBe('conditional');
    expect(adapter.weight).toBe(2);
  });
});
