import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readBoolean, readNumber, readSubjectMetrics } from '../signals';

/**
 * Options for the availability adapter.
 */
export interface Hcs25AvailabilityAdapterOptions {
  /**
   * How to interpret `availabilityScore`. `auto` (the default) treats
   * values up to and including one as a ratio and larger values as an
   * already-normalized percent.
   */
  scoreScale?: 'ratio' | 'percent' | 'auto';
  /** Recency window in minutes for last-seen decay. Defaults to 1440. */
  recencyWindowMinutes?: number;
  /** Registries where reachability is not meaningful. */
  excludeRegistries?: readonly string[];
}

const DEFAULT_EXCLUDED_REGISTRIES: readonly string[] = [
  'openrouter',
  'near-ai',
];

function normalizeAvailability(
  subject: Hcs25Subject,
  scoreScale: 'ratio' | 'percent' | 'auto',
  recencyWindowMinutes: number,
): Hcs25NormalizedValue {
  const metadata = subject.metadata;
  const rawScore = metadata ? readNumber(metadata, 'availabilityScore') : null;
  if (rawScore !== null) {
    const ratio =
      scoreScale === 'ratio'
        ? rawScore
        : scoreScale === 'percent'
          ? rawScore / 100
          : rawScore > 1
            ? rawScore / 100
            : rawScore;
    return { value: clampScore(ratio * 100), status: 'ok' };
  }

  const metrics = readSubjectMetrics(subject);
  const minsFromLastOnline = readNumber(metrics, 'minsFromLastOnline');
  if (minsFromLastOnline !== null) {
    return {
      value: clampScore(100 * (1 - minsFromLastOnline / recencyWindowMinutes)),
      status: 'ok',
    };
  }

  const isOnline = readBoolean(metrics, 'isOnline');
  if (isOnline !== null) {
    return { value: isOnline ? 100 : 0, status: 'ok' };
  }

  return { value: 0, status: 'missing' };
}

/**
 * Creates the `availability` adapter: rewards reachable endpoints and
 * penalizes long offline windows using a linear 24-hour recency decay.
 */
export function createAvailabilityAdapter(
  options: Hcs25AvailabilityAdapterOptions = {},
): Hcs25AdapterDefinition {
  const scoreScale = options.scoreScale ?? 'auto';
  const recencyWindowMinutes = options.recencyWindowMinutes ?? 1440;

  return {
    id: 'availability',
    weight: 1,
    contributionMode: 'universal',
    excludeRegistries: options.excludeRegistries ?? DEFAULT_EXCLUDED_REGISTRIES,
    defaultComponentKey: 'availability.uptime',
    components: [
      {
        name: 'uptime',
        normalize: ({ subject }) =>
          normalizeAvailability(subject, scoreScale, recencyWindowMinutes),
      },
    ],
  };
}
