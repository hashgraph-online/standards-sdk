import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readNumber, readSubjectMetrics } from '../signals';
import { logScale, normalizeRatio } from './normalization';

/**
 * Options for the ACP/Virtuals marketplace adapter.
 */
export interface Hcs25AcpAdapterOptions {
  /** Volume cap used for log scaling delivery volume. Default 500. */
  volumeCap?: number;
  /** Revenue cap used for log scaling revenue. Default 10000. */
  revenueCap?: number;
  /** Registries where marketplace metrics apply. */
  includeRegistries?: readonly string[];
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['virtuals-protocol'];

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

function readAcpField(subject: Hcs25Subject, key: string): number | null {
  const metricsValue = readNumber(readSubjectMetrics(subject), key);
  if (metricsValue !== null) {
    return metricsValue;
  }
  const metadata = subject.metadata;
  return metadata ? readNumber(metadata, key) : null;
}

/**
 * Creates the `acp` adapter: normalizes marketplace-native execution
 * performance (job success, delivery volume, revenue, ratings) for
 * ACP/Virtuals-style agents. Delivery volume falls back to the successful
 * job count when no provider-defined volume exists.
 */
export function createAcpAdapter(
  options: Hcs25AcpAdapterOptions = {},
): Hcs25AdapterDefinition {
  const volumeCap = options.volumeCap ?? 500;
  const revenueCap = options.revenueCap ?? 10000;

  return {
    id: 'acp',
    weight: 2,
    contributionMode: 'scoped',
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    components: [
      {
        name: 'jobs.successRate',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const raw = readAcpField(subject, 'successRate');
          return raw === null
            ? MISSING
            : { value: clampScore(normalizeRatio(raw) * 100), status: 'ok' };
        },
      },
      {
        name: 'jobs.deliveryVolume',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const volume =
            readAcpField(subject, 'volume') ??
            readAcpField(subject, 'successfulJobCount');
          return volume === null
            ? MISSING
            : { value: logScale(volume, volumeCap), status: 'ok' };
        },
      },
      {
        name: 'jobs.revenue',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const revenue = readAcpField(subject, 'revenue');
          return revenue === null
            ? MISSING
            : { value: logScale(revenue, revenueCap), status: 'ok' };
        },
      },
      {
        name: 'reviews.rating',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const rating = readAcpField(subject, 'rating');
          return rating === null
            ? MISSING
            : { value: clampScore((rating / 5) * 100), status: 'ok' };
        },
      },
    ],
  };
}
