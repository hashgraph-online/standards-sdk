import { clampScore } from '../scoring';
import type { Hcs25AdapterDefinition, Hcs25NormalizedValue } from '../types';
import { isJsonObject, readNumber, readSubjectAdditional } from '../signals';

/**
 * Options for the connectivity probe adapter. The adapter is
 * implementation-specific: probes are performed by signal adapters and their
 * results are stored on the subject record.
 */
export interface Hcs25ConnectivityAdapterOptions {
  /**
   * Probe target identifiers. When provided, one `connectivity.<target>`
   * component is emitted per target from the stored
   * `metadata.additional.connectivityTargets` record. When omitted, a single
   * `connectivity.score` component is emitted from
   * `metadata.additional.connectivityScore`.
   */
  targets?: readonly string[];
  /** Registries where a connectivity probe is not meaningful. */
  excludeRegistries?: readonly string[];
}

const DEFAULT_EXCLUDED_REGISTRIES: readonly string[] = [
  'openrouter',
  'near-ai',
];

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

/**
 * Creates the `connectivity` adapter: scores stored connectivity probe
 * results. Contribution is conditional, so subjects without probe results
 * stay out of the denominator.
 */
export function createConnectivityAdapter(
  options: Hcs25ConnectivityAdapterOptions = {},
): Hcs25AdapterDefinition {
  const targets = options.targets ?? [];
  const excludeRegistries =
    options.excludeRegistries ?? DEFAULT_EXCLUDED_REGISTRIES;

  if (targets.length === 0) {
    return {
      id: 'connectivity',
      weight: 1,
      contributionMode: 'conditional',
      excludeRegistries,
      defaultComponentKey: 'connectivity.score',
      components: [
        {
          name: 'score',
          nonScorableWhenUnavailable: true,
          normalize: ({ subject }): Hcs25NormalizedValue => {
            const score = readNumber(
              readSubjectAdditional(subject),
              'connectivityScore',
            );
            return score === null
              ? MISSING
              : { value: clampScore(score), status: 'ok' };
          },
        },
      ],
    };
  }

  return {
    id: 'connectivity',
    weight: 1,
    contributionMode: 'conditional',
    excludeRegistries,
    components: targets.map(target => ({
      name: target,
      nonScorableWhenUnavailable: true,
      normalize: ({ subject }): Hcs25NormalizedValue => {
        const stored = readSubjectAdditional(subject).connectivityTargets;
        if (!isJsonObject(stored)) {
          return MISSING;
        }
        const score = readNumber(stored, target);
        return score === null
          ? MISSING
          : { value: clampScore(score), status: 'ok' };
      },
    })),
  };
}
