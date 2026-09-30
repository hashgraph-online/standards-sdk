import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString, readSubjectAdditional } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

const ETHOS_API_BASE_URL = 'https://api.ethos.network/api/v2';
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * A resolved Ethos userkey source: the userkey, how it was derived, and its
 * composite weight (per the ethos signal document's `ethosSources` schema).
 */
export interface Hcs25EthosSource {
  userkey: string;
  kind: 'explicit' | 'x' | 'address';
  weight: number;
}

/**
 * Options for the Ethos signal adapter.
 */
export interface Hcs25EthosSignalAdapterOptions {
  /** Ethos API base URL. Default `https://api.ethos.network/api/v2`. */
  baseUrl?: string;
  /** `X-Ethos-Client` identifier sent with every request. */
  client?: string;
  /**
   * Explicit source list; when omitted, sources are derived from
   * `metadata.ethosUserkey`, `metadata.address|evmAddress|nativeId` (EVM),
   * and `metadata.additional.twitter|xHandle|x` handles.
   */
  sources?: (subject: Hcs25Subject) => readonly Hcs25EthosSource[];
  /** Per-adapter timeout in milliseconds. */
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_EXCLUDED_REGISTRIES: readonly string[] = [
  'openrouter',
  'near-ai',
  'agentverse',
  'uagent',
];

const DEFAULT_SOURCE_WEIGHTS: Record<Hcs25EthosSource['kind'], number> = {
  explicit: 1,
  address: 1,
  x: 1,
};

interface EthosScoreResponse {
  score?: number;
  level?: string;
}

function ethosScoreUrl(baseUrl: string, userkey: string): string {
  if (userkey.startsWith('address:')) {
    const address = userkey.slice('address:'.length);
    return `${baseUrl}/score/address?address=${encodeURIComponent(address)}`;
  }
  return `${baseUrl}/score/userkey?userkey=${encodeURIComponent(userkey)}`;
}

function findEvmAddress(subject: Hcs25Subject): string | null {
  const metadata = subject.metadata ?? {};
  for (const key of ['address', 'evmAddress', 'nativeId', 'uid']) {
    const value = readString(metadata, key);
    if (value && EVM_ADDRESS_PATTERN.test(value)) {
      return value;
    }
  }
  return null;
}

function findXHandle(subject: Hcs25Subject): string | null {
  const additional = readSubjectAdditional(subject);
  for (const key of ['twitter', 'xHandle', 'x', 'twitterHandle']) {
    const value = readString(additional, key);
    if (value) {
      return value.replace(/^@/, '');
    }
  }
  const metadata = subject.metadata ?? {};
  for (const key of ['twitter', 'xHandle', 'x']) {
    const value = readString(metadata, key);
    if (value) {
      return value.replace(/^@/, '');
    }
  }
  return null;
}

function deriveSources(subject: Hcs25Subject): Hcs25EthosSource[] {
  const sources: Hcs25EthosSource[] = [];
  const explicit = readString(subject.metadata ?? {}, 'ethosUserkey');
  if (explicit) {
    sources.push({
      userkey: explicit,
      kind: 'explicit',
      weight: DEFAULT_SOURCE_WEIGHTS.explicit,
    });
  }
  const address = findEvmAddress(subject);
  if (address) {
    sources.push({
      userkey: `address:${address}`,
      kind: 'address',
      weight: DEFAULT_SOURCE_WEIGHTS.address,
    });
  }
  const handle = findXHandle(subject);
  if (handle) {
    sources.push({
      userkey: `service:x.com:username:${handle}`,
      kind: 'x',
      weight: DEFAULT_SOURCE_WEIGHTS.x,
    });
  }
  return sources;
}

/**
 * Creates the `ethos` signal adapter: resolves the subject's Ethos userkeys
 * (explicit, EVM address, X handle), fetches each source's score from the
 * Ethos API, and writes the `ethosScore`/`ethosScoreStatus`/`ethosSources`/
 * `ethosComposite` stored fields per the signal catalog.
 */
export function createEthosSignalAdapter(
  options: Hcs25EthosSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const baseUrl = options.baseUrl ?? ETHOS_API_BASE_URL;
  const resolveSources = options.sources ?? deriveSources;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const sources = resolveSources(subject);

    if (sources.length === 0) {
      return [
        {
          signalId: 'ethos.score',
          status: 'missing',
          fields: [
            {
              scope: 'root',
              values: {
                ethosScore: null,
                ethosScoreStatus: 'missing',
                ethosScoreUpdatedAt: now,
                ethosSources: [],
              },
            },
          ],
        },
      ];
    }

    const headers: Record<string, string> = options.client
      ? { 'X-Ethos-Client': options.client }
      : {};

    const sourcesOut: Record<string, Hcs25JsonValue>[] = [];
    let sawError = false;

    for (const source of sources) {
      try {
        const data = await requestJson<EthosScoreResponse>(
          ethosScoreUrl(baseUrl, source.userkey),
          {
            fetch: context.fetch,
            headers,
            timeoutMs: context.timeoutMs,
            signal: context.signal,
          },
        );
        sourcesOut.push({
          userkey: source.userkey,
          kind: source.kind,
          weight: source.weight,
          status: typeof data.score === 'number' ? 'ok' : 'missing',
          score: typeof data.score === 'number' ? data.score : null,
          updatedAt: now,
        });
      } catch (error) {
        const isMissing =
          error instanceof Hcs25CollectorHttpError && error.status === 404;
        if (!isMissing && !isTimeoutError(error)) {
          sawError = true;
        }
        sourcesOut.push({
          userkey: source.userkey,
          kind: source.kind,
          weight: source.weight,
          status: isMissing
            ? 'missing'
            : isTimeoutError(error)
              ? 'timeout'
              : 'error',
          score: null,
          updatedAt: now,
        });
      }
    }

    let weightedSum = 0;
    let totalWeight = 0;
    for (const entry of sourcesOut) {
      const score = entry.score;
      const weight = typeof entry.weight === 'number' ? entry.weight : 1;
      if (typeof score === 'number') {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }
    const composite =
      totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 100) / 100
        : null;
    const compositeStatus =
      composite !== null ? 'ok' : sawError ? 'error' : 'missing';

    return [
      {
        signalId: 'ethos.score',
        status:
          compositeStatus === 'ok'
            ? 'ok'
            : compositeStatus === 'error'
              ? 'error'
              : 'missing',
        value: composite,
        fields: [
          {
            scope: 'root',
            values: {
              ethosUserkey: sources[0].userkey,
              ethosScore: composite,
              ethosScoreStatus: compositeStatus,
              ethosScoreUpdatedAt: now,
              ethosSources: sourcesOut,
              ethosComposite: {
                version: 1,
                score: composite,
                updatedAt: now,
                weights: Object.fromEntries(
                  sources.map(source => [source.userkey, source.weight]),
                ),
              },
            },
          },
        ],
        provenance: {
          source: 'ethos',
          sourceUrl: baseUrl,
          subjectId: subject.id,
          fetchedAt: now,
          params: { userkeys: sources.map(source => source.userkey) },
        },
      },
    ];
  };

  return {
    id: 'ethos',
    produces: ['ethos.score'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries,
    excludeRegistries: options.excludeRegistries ?? DEFAULT_EXCLUDED_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}
