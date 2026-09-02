import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import {
  readNumber,
  readString,
  readSubjectAdditional,
  type Hcs25JsonObject,
} from '../signals';

/**
 * Options for the OpenRouter benchmarks adapter.
 */
export interface Hcs25OpenRouterEvalsAdapterOptions {
  /** Multiplier applied to scores whose coverage status is `low-coverage`. */
  lowCoverageMultiplier?: number;
  /** Model catalog registries where the adapter applies. */
  includeRegistries?: readonly string[];
}

/**
 * A heuristic model tier: a score plus the lowercase identifier patterns
 * that map to it. The first matching tier wins.
 */
export interface Hcs25ModelTier {
  score: number;
  patterns: readonly string[];
}

/**
 * Options for the fallback model-tier adapter.
 */
export interface Hcs25ModelTierAdapterOptions {
  /** Tier table; the first matching tier wins. */
  tiers?: readonly Hcs25ModelTier[];
  /** Score for models that match no tier. Default 50. */
  defaultScore?: number;
  /** Metadata keys checked for the model identifier, in order. */
  modelIdKeys?: readonly string[];
  /** Model catalog registries where the adapter applies. */
  includeRegistries?: readonly string[];
}

const DEFAULT_MODEL_REGISTRIES: readonly string[] = ['openrouter', 'near-ai'];

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

const DEFAULT_MODEL_TIERS: readonly Hcs25ModelTier[] = [
  {
    score: 95,
    patterns: [
      'gpt-5',
      'gpt-4.5',
      'o3',
      'o4-mini',
      'claude-opus-4',
      'claude-4-opus',
      'gemini-3',
      'grok-4',
    ],
  },
  {
    score: 85,
    patterns: [
      'claude-sonnet-4',
      'claude-4-sonnet',
      'claude-3-7-sonnet',
      'gemini-2.5-pro',
      'deepseek-v3',
      'deepseek-r1',
      'llama-4-maverick',
      'qwen3-235b',
      'grok-3',
    ],
  },
  {
    score: 70,
    patterns: [
      'gpt-4o',
      'gemini-2.5-flash',
      'claude-haiku',
      'llama-4-scout',
      'qwen3-32b',
      'mistral-large',
    ],
  },
  {
    score: 55,
    patterns: ['llama-3.3', 'llama-3.1', 'qwen', 'mistral', 'gemma', 'phi-'],
  },
  { score: 35, patterns: ['llama-2', 'gpt-3.5', 'gemini-1'] },
];

const DEFAULT_MODEL_ID_KEYS: readonly string[] = [
  'openrouterModelId',
  'modelId',
  'model',
];

/**
 * Creates the `openrouter-evals` adapter: exposes a coverage-aware
 * benchmark component for model catalog entries, down-weighting
 * low-coverage scores.
 */
export function createOpenRouterEvalsAdapter(
  options: Hcs25OpenRouterEvalsAdapterOptions = {},
): Hcs25AdapterDefinition {
  const lowCoverageMultiplier = options.lowCoverageMultiplier ?? 0.5;

  return {
    id: 'openrouter-evals',
    weight: 0.5,
    contributionMode: 'scoped',
    includeRegistries: options.includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    defaultComponentKey: 'openrouter-evals.score',
    components: [
      {
        name: 'score',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const additional: Hcs25JsonObject = readSubjectAdditional(subject);
          const score = readNumber(additional, 'openrouterEvalScore');
          const status = readString(additional, 'openrouterEvalStatus');

          if (score === null || status === 'missing') {
            return MISSING;
          }

          const multiplier =
            status === 'low-coverage' ? lowCoverageMultiplier : 1;
          return { value: clampScore(score * multiplier), status: 'ok' };
        },
      },
    ],
  };
}

/**
 * Creates the `chatbot-arena` adapter: exposes an independent
 * preference-leaderboard signal as a normalized component.
 */
export function createChatbotArenaAdapter(
  includeRegistries?: readonly string[],
): Hcs25AdapterDefinition {
  return {
    id: 'chatbot-arena',
    weight: 6,
    contributionMode: 'scoped',
    includeRegistries: includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    defaultComponentKey: 'chatbot-arena.score',
    components: [
      {
        name: 'score',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const additional = readSubjectAdditional(subject);
          const score = readNumber(additional, 'chatbotArenaEvalScore');
          const status = readString(additional, 'chatbotArenaEvalStatus');

          if (score === null || status !== 'ok') {
            return MISSING;
          }
          return { value: clampScore(score), status: 'ok' };
        },
      },
    ],
  };
}

/**
 * Creates the `huggingface-model-index` adapter: exposes Hugging
 * Face-derived model-index and popularity signals, contributing only when
 * coverage exists.
 */
export function createHuggingFaceModelIndexAdapter(
  includeRegistries?: readonly string[],
): Hcs25AdapterDefinition {
  return {
    id: 'huggingface-model-index',
    weight: 0.8,
    contributionMode: 'conditional',
    includeRegistries: includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    defaultComponentKey: 'huggingface-model-index.score',
    components: [
      {
        name: 'score',
        nonScorableWhenUnavailable: true,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const additional = readSubjectAdditional(subject);
          const score =
            readNumber(additional, 'huggingFaceEvalScore') ??
            readNumber(additional, 'huggingFaceSignalScore');
          const status = readString(additional, 'huggingFaceEvalStatus');
          const mode = readString(additional, 'huggingFaceEvalMode');

          if (score === null || status !== 'ok' || mode === 'missing') {
            return MISSING;
          }
          return { value: clampScore(score), status: 'ok' };
        },
      },
    ],
  };
}

/**
 * Creates the `openllm-leaderboard` adapter: exposes a benchmark-derived
 * leaderboard score, contributing only when a record exists.
 */
export function createOpenLlmLeaderboardAdapter(
  includeRegistries?: readonly string[],
): Hcs25AdapterDefinition {
  return {
    id: 'openllm-leaderboard',
    weight: 1,
    contributionMode: 'conditional',
    includeRegistries: includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    defaultComponentKey: 'openllm-leaderboard.score',
    components: [
      {
        name: 'score',
        nonScorableWhenUnavailable: true,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const additional = readSubjectAdditional(subject);
          const score = readNumber(additional, 'openLlmEvalScore');
          const status = readString(additional, 'openLlmEvalStatus');

          if (score === null || status !== 'ok') {
            return MISSING;
          }
          return { value: clampScore(score), status: 'ok' };
        },
      },
    ],
  };
}

/**
 * Creates the `model-tier` adapter: a deterministic fallback heuristic for
 * model catalogs with sparse external-eval coverage. It suppresses itself
 * when OpenRouter coverage is sufficient or any independent eval source
 * exists, per the specification's fallback-only guidance.
 */
export function createModelTierAdapter(
  options: Hcs25ModelTierAdapterOptions = {},
): Hcs25AdapterDefinition {
  const tiers = options.tiers ?? DEFAULT_MODEL_TIERS;
  const defaultScore = options.defaultScore ?? 50;
  const modelIdKeys = options.modelIdKeys ?? DEFAULT_MODEL_ID_KEYS;

  return {
    id: 'model-tier',
    weight: 2,
    contributionMode: 'conditional',
    includeRegistries: options.includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    defaultComponentKey: 'model-tier.score',
    components: [
      {
        name: 'score',
        nonScorableWhenUnavailable: true,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const additional = readSubjectAdditional(subject);

          const hasStrongCoverage =
            readString(additional, 'openrouterEvalStatus') === 'ok';
          const hasIndependentEvals = [
            'chatbotArenaEvalStatus',
            'huggingFaceEvalStatus',
            'openLlmEvalStatus',
          ].some(key => readString(additional, key) === 'ok');
          if (hasStrongCoverage || hasIndependentEvals) {
            return MISSING;
          }

          const modelId = modelIdKeys
            .map(key => readString(additional, key))
            .find((value): value is string => value !== null);
          if (modelId === null) {
            return MISSING;
          }

          const normalizedId = modelId.toLowerCase();
          const tier = tiers.find(entry =>
            entry.patterns.some(pattern =>
              normalizedId.includes(pattern.toLowerCase()),
            ),
          );
          return {
            value: clampScore(tier ? tier.score : defaultScore),
            status: 'ok',
          };
        },
      },
    ],
  };
}
