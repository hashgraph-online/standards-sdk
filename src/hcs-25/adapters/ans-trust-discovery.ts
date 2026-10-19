import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25ComponentDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import {
  HCS25_ANS_TRUST_DISCOVERY_SIGNALS,
  readMetadataRecord,
  readNumber,
  readString,
  type Hcs25AnsTrustDiscoverySignal,
} from '../signals';

/**
 * Options for the ANS Trust Discovery adapter.
 */
export interface Hcs25AnsTrustDiscoveryAdapterOptions {
  /**
   * Registries whose subjects carry ANS Trust Index signals. Default
   * `['ans', 'godaddy-ans']`: `ans` is the HCS-14 registry value and
   * `godaddy-ans` is the Registry Broker namespace for the same agents.
   */
  includeRegistries?: readonly string[];
}

const ADAPTER_ID = 'ans-trust-discovery';

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['ans', 'godaddy-ans'];

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

/**
 * Maps a stored `ansTrustDiscoveryStatus` onto one signal. A present score
 * keeps `stale` so the scoring layer applies the stale multiplier, and
 * otherwise passes through as ok. `timeout` or `error` with no score surfaces
 * as that status. Anything else without a score is missing.
 */
function ansTrustStatus(
  status: string | null,
  score: number | null,
): Hcs25NormalizedValue {
  if (score !== null) {
    return {
      value: clampScore(score),
      status: status === 'stale' ? 'stale' : 'ok',
    };
  }
  if (status === 'timeout' || status === 'error') {
    return { value: 0, status };
  }
  return MISSING;
}

/**
 * Reads one stored signal score from `metadata.ansTrustDiscovery`.
 */
function normalizeAnsTrustSignal(
  subject: Hcs25Subject,
  signal: Hcs25AnsTrustDiscoverySignal,
): Hcs25NormalizedValue {
  const record = readMetadataRecord(subject, 'ansTrustDiscovery');
  if (!record) {
    return MISSING;
  }

  return ansTrustStatus(
    readString(record, 'ansTrustDiscoveryStatus'),
    readNumber(record, `${ADAPTER_ID}.${signal}`),
  );
}

/**
 * Creates the `ans-trust-discovery` adapter: passes through the
 * infrastructure trust signals published by an ANS Trust Index provider
 * (certificate type, DNS security, agent age, version stability, DNS
 * consistency, HTTPS record, agent card, certificate hygiene) as one
 * component each. Scores are pre-normalized to `[0,100]` by the provider;
 * signals the provider could not compute are excluded from the adapter
 * total, which is the mean of the remaining components.
 *
 * Applies to subjects whose `registry` is `ans` (the HCS-14 UAID `registry`
 * value) or `godaddy-ans` (the Registry Broker namespace); callers set
 * `subject.registry` when building the subject.
 */
export function createAnsTrustDiscoveryAdapter(
  options: Hcs25AnsTrustDiscoveryAdapterOptions = {},
): Hcs25AdapterDefinition {
  return {
    id: ADAPTER_ID,
    weight: 1,
    contributionMode: 'scoped',
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    defaultComponentKey: `${ADAPTER_ID}.certtype`,
    components: HCS25_ANS_TRUST_DISCOVERY_SIGNALS.map(
      (signal): Hcs25ComponentDefinition => ({
        name: signal,
        nonScorableWhenUnavailable: true,
        normalize: ({ subject }): Hcs25NormalizedValue =>
          normalizeAnsTrustSignal(subject, signal),
      }),
    ),
  };
}
