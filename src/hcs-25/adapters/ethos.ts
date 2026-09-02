import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readMetadataRecord, readNumber, readString } from '../signals';
import { clampUnit } from './normalization';

/**
 * Options for the Ethos credibility adapter.
 */
export interface Hcs25EthosAdapterOptions {
  /** Raw Ethos score that maps to a zero contribution. Default 1200. */
  baselineScore?: number;
  /** Raw Ethos score that maps to the maximum contribution. Default 2000. */
  maxScore?: number;
  /** Maximum contribution budget in `[0,100]`. Default 100. */
  maxContribution?: number;
  /** Registries where Ethos identity mapping is undefined. */
  excludeRegistries?: readonly string[];
}

const DEFAULT_EXCLUDED_REGISTRIES: readonly string[] = [
  'openrouter',
  'near-ai',
  'agentverse',
  'uagent',
];

const MISSING_SCORE: Hcs25NormalizedValue = { value: 0, status: 'missing' };

function normalizeEthos(
  subject: Hcs25Subject,
  baselineScore: number,
  maxScore: number,
  maxContribution: number,
): Hcs25NormalizedValue {
  const metadata = subject.metadata;
  const composite = readMetadataRecord(subject, 'ethosComposite');
  const compositeScore = composite ? readNumber(composite, 'score') : null;
  const flatScore = metadata ? readNumber(metadata, 'ethosScore') : null;
  const status = metadata ? readString(metadata, 'ethosScoreStatus') : null;

  const rawScore = compositeScore ?? flatScore;
  if (rawScore === null) {
    if (status === 'error') {
      return { value: 0, status: 'error' };
    }
    if (status === 'ok') {
      return { value: 0, status: 'missing' };
    }
    return MISSING_SCORE;
  }

  const denominator = maxScore - baselineScore;
  if (denominator <= 0) {
    return { value: clampScore(maxContribution), status: 'ok' };
  }

  const normalized = clampUnit((rawScore - baselineScore) / denominator);
  return { value: clampScore(maxContribution * normalized), status: 'ok' };
}

/**
 * Creates the `ethos` adapter: maps a raw Ethos reputation score into a
 * bounded trust contribution using configured baseline, max, and budget
 * anchors.
 */
export function createEthosAdapter(
  options: Hcs25EthosAdapterOptions = {},
): Hcs25AdapterDefinition {
  const baselineScore = options.baselineScore ?? 1200;
  const maxScore = options.maxScore ?? 2000;
  const maxContribution = options.maxContribution ?? 100;

  return {
    id: 'ethos',
    weight: 1,
    contributionMode: 'universal',
    excludeRegistries: options.excludeRegistries ?? DEFAULT_EXCLUDED_REGISTRIES,
    defaultComponentKey: 'ethos.score',
    components: [
      {
        name: 'score',
        normalize: ({ subject }) =>
          normalizeEthos(subject, baselineScore, maxScore, maxContribution),
      },
    ],
  };
}
