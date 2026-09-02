import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readMetadataRecord, readNumber } from '../signals';
import { clampUnit } from './normalization';

/**
 * Options for the ERC-8004 feedback adapter.
 */
export interface Hcs25Erc8004FeedbackAdapterOptions {
  /** Multiplier applied to log10 of the feedback count. Default 10. */
  volumeWeight?: number;
  /** Cap on the raw volume score before normalization. Default 20. */
  volumeCap?: number;
  /** Registries where ERC-8004 feedback applies. */
  includeRegistries?: readonly string[];
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['erc-8004'];

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

function normalizeRating(subject: Hcs25Subject): Hcs25NormalizedValue {
  const summary = readMetadataRecord(subject, 'erc8004FeedbackSummary');
  const averageScore = summary ? readNumber(summary, 'averageScore') : null;
  return averageScore === null
    ? MISSING
    : { value: clampScore(averageScore), status: 'ok' };
}

/**
 * Creates the `erc8004-feedback` adapter: converts an ERC-8004 feedback
 * summary (average rating plus feedback volume) into trust components,
 * log-scaling volume so a single rating cannot dominate.
 */
export function createErc8004FeedbackAdapter(
  options: Hcs25Erc8004FeedbackAdapterOptions = {},
): Hcs25AdapterDefinition {
  const volumeWeight = options.volumeWeight ?? 10;
  const volumeCap = options.volumeCap ?? 20;

  return {
    id: 'erc8004-feedback',
    weight: 1,
    contributionMode: 'scoped',
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    components: [
      {
        name: 'rating',
        normalize: ({ subject }) => normalizeRating(subject),
      },
      {
        name: 'volume',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const summary = readMetadataRecord(subject, 'erc8004FeedbackSummary');
          const totalFeedbacks = summary
            ? readNumber(summary, 'totalFeedbacks')
            : null;
          if (totalFeedbacks === null) {
            return MISSING;
          }
          const volumeRaw = Math.min(
            volumeCap,
            Math.log10(totalFeedbacks + 1) * volumeWeight,
          );
          return {
            value: clampScore(100 * clampUnit(volumeRaw / volumeCap)),
            status: 'ok',
          };
        },
      },
    ],
  };
}
