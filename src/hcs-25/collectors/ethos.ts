import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject, readString, readSubjectAdditional } from '../signals';
import { parseTimestampMs } from './freshness';
import {
  Hcs25CollectorHttpError,
  isTimeoutError,
  requestJson,
  stripTrailingSlashes,
} from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

const ETHOS_API_BASE_URL = 'https://api.ethos.network';
const DEFAULT_CLIENT_ID = 'standards-sdk';
const EMBEDDED_EVM_ADDRESS_PATTERN = /0x[0-9a-fA-F]{40}/;
const TWITTER_HANDLE_PATTERN = /^[a-zA-Z0-9_]{1,64}$/;

type EthosSourceKind = 'explicit' | 'x' | 'address';
type EthosStoredStatus = 'ok' | 'missing' | 'error';

/**
 * A resolved Ethos userkey source: the userkey, how it was derived, and its
 * composite weight (per the ethos signal document's `ethosSources` schema).
 */
export interface Hcs25EthosSource {
  userkey: string;
  kind: EthosSourceKind;
  weight: number;
  status?: EthosStoredStatus;
  score?: number | null;
  updatedAt?: string;
}

/**
 * Options for the Ethos signal adapter.
 */
export interface Hcs25EthosSignalAdapterOptions {
  /**
   * Ethos API base URL; the collector requests
   * `{baseUrl}/api/v1/score/{userkey}` (the production v1 endpoint, which
   * returns an `{ok, data: {score}}` envelope). Default
   * `https://api.ethos.network`.
   */
  baseUrl?: string;
  /** `X-Ethos-Client` identifier sent with every request. */
  client?: string;
  /**
   * Explicit source list; when omitted, sources are derived per the
   * production derivation rules (see {@link deriveEthosSources}).
   */
  sources?: (subject: Hcs25Subject) => readonly Hcs25EthosSource[];
  /**
   * Refresh interval applied to sources whose stored status is `ok`.
   * Default 12 hours. Set to 0 to always refetch.
   */
  ttlMs?: number;
  /**
   * Refresh interval applied to sources in `missing`/`error` state.
   * Default 6 hours.
   */
  failureTtlMs?: number;
  /** Transient-failure retries per source request. Default 2. */
  maxRetries?: number;
  /**
   * When false, disables EVM-address inference (`agentAddress`,
   * `ownerAddress`, `payTo`, `agentAddressCaip`, `nativeId`, …). Default
   * true.
   */
  inferAddress?: boolean;
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

interface EthosScoreResponse {
  ok?: boolean;
  data?: { score?: number };
  score?: number;
}

const normalizeRegistry = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const extractAddress = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const match = EMBEDDED_EVM_ADDRESS_PATTERN.exec(value.trim());
  return match ? match[0] : null;
};

/**
 * Normalizes a stored/explicit Ethos userkey: values already containing a
 * `kind:` prefix pass through; bare EVM addresses become `address:0x…`.
 */
export function normalizeEthosUserkey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes(':')) {
    return trimmed;
  }
  const address = extractAddress(trimmed);
  return address ? `address:${address}` : null;
}

const userkeyKind = (userkey: string): EthosSourceKind => {
  const trimmed = userkey.trim();
  if (trimmed.startsWith('address:')) {
    return 'address';
  }
  if (trimmed.startsWith('service:x.com:')) {
    return 'x';
  }
  return 'explicit';
};

const normalizeTwitterHandle = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const withoutAt = value.trim().replace(/^@/, '').replace(/\s+/g, '');
  return TWITTER_HANDLE_PATTERN.test(withoutAt) ? withoutAt : null;
};

const extractTwitterFromSocials = (profile: unknown): string | null => {
  if (!isJsonObject(profile as Hcs25JsonValue)) {
    return null;
  }
  const socials = (profile as Record<string, Hcs25JsonValue>).socials;
  if (!Array.isArray(socials)) {
    return null;
  }
  for (const entry of socials) {
    if (!isJsonObject(entry)) {
      continue;
    }
    const platform = normalizeRegistry(
      (entry as Record<string, Hcs25JsonValue>).platform,
    );
    if (platform !== 'twitter' && platform !== 'x') {
      continue;
    }
    const handle = normalizeTwitterHandle(
      (entry as Record<string, Hcs25JsonValue>).handle,
    );
    if (handle) {
      return handle;
    }
  }
  return null;
};

/**
 * True when the subject is structurally outside Ethos coverage (uAgent /
 * AgentVerse agents per the ethos signal doc).
 */
export function isEthosExcluded(subject: Hcs25Subject): boolean {
  const registry = normalizeRegistry(subject.registry);
  const metadata = subject.metadata ?? {};
  const protocol = normalizeRegistry(
    (metadata as Record<string, Hcs25JsonValue>).protocol,
  );
  const protocols = Array.isArray(
    (subject as { protocols?: unknown }).protocols,
  )
    ? ((subject as { protocols?: unknown[] }).protocols ?? [])
        .filter((v): v is string => typeof v === 'string')
        .map(normalizeRegistry)
    : [];
  return (
    registry === 'agentverse' ||
    registry === 'uagent' ||
    protocol === 'uagent' ||
    protocols.includes('uagent')
  );
}

/**
 * Derives Ethos userkey sources per the production rules:
 *
 * - `metadata.trustProviderIds.ethos` / `metadata.trust.providers.ethos` /
 *   `metadata.ethosUserkey` are explicit userkeys (weight 1, short-circuit).
 * - `virtuals-protocol` subjects derive an `x` source from
 *   `twitterHandle`/`memeTwitterHandle`/`profile.socials` (weight 0.7);
 *   `moltbook` subjects derive from `moltbook.owner`/`profile.socials`
 *   (weight 1). Other registries use the generic
 *   `additional.twitter|xHandle|x|twitterHandle` keys (weight 1).
 * - `agentAddress`, `ownerAddress`, `payTo`, `agentAddressCaip`,
 *   `nativeId`, `address`, `evmAddress`, `uid` yield an `address:` source
 *   (embedded `0x…` extraction makes CAIP ids work). Weight drops to 0.3
 *   when an `x` source already exists on a weighted registry.
 */
export function deriveEthosSources(subject: Hcs25Subject): Hcs25EthosSource[] {
  const metadata = subject.metadata ?? {};
  const registry = normalizeRegistry(subject.registry);
  const additional = readSubjectAdditional(subject);
  const epoch = new Date(0).toISOString();
  const push = (
    list: Hcs25EthosSource[],
    userkey: string,
    kind: EthosSourceKind,
    weight: number,
  ): void => {
    if (!list.some(source => source.userkey === userkey)) {
      list.push({
        userkey,
        kind,
        weight,
        status: 'missing',
        score: null,
        updatedAt: epoch,
      });
    }
  };

  const sources: Hcs25EthosSource[] = [];

  const trustProviderIds = isJsonObject(metadata.trustProviderIds)
    ? metadata.trustProviderIds
    : undefined;
  const trustProviders =
    isJsonObject(metadata.trust) && isJsonObject(metadata.trust.providers)
      ? (metadata.trust.providers as Record<string, Hcs25JsonValue>)
      : undefined;
  for (const candidate of [
    trustProviderIds?.ethos,
    trustProviders?.ethos,
    metadata.ethosUserkey,
  ]) {
    const userkey = normalizeEthosUserkey(candidate);
    if (userkey) {
      push(sources, userkey, userkeyKind(userkey), 1);
      return sources;
    }
  }

  const metadataRecord = metadata as Record<string, Hcs25JsonValue>;
  const profileSocials =
    extractTwitterFromSocials(metadataRecord.profile) ??
    extractTwitterFromSocials((subject as { profile?: unknown }).profile);

  if (registry === 'virtuals-protocol') {
    const handle =
      normalizeTwitterHandle(metadataRecord.twitterHandle) ??
      normalizeTwitterHandle(metadataRecord.memeTwitterHandle) ??
      profileSocials;
    if (handle) {
      push(sources, `service:x.com:username:${handle}`, 'x', 0.7);
    }
  } else if (registry === 'moltbook') {
    const owner = isJsonObject(metadataRecord.moltbook)
      ? normalizeTwitterHandle(
          (metadataRecord.moltbook as Record<string, Hcs25JsonValue>).owner,
        )
      : null;
    const handle = owner ?? profileSocials;
    if (handle) {
      push(sources, `service:x.com:username:${handle}`, 'x', 1);
    }
  } else {
    const genericHandle = [
      readString(additional, 'twitter'),
      readString(additional, 'xHandle'),
      readString(additional, 'x'),
      readString(additional, 'twitterHandle'),
      readString(metadataRecord, 'twitter'),
      readString(metadataRecord, 'xHandle'),
      readString(metadataRecord, 'x'),
      profileSocials,
    ]
      .map(normalizeTwitterHandle)
      .find((handle): handle is string => handle !== null);
    if (genericHandle) {
      push(sources, `service:x.com:username:${genericHandle}`, 'x', 1);
    }
  }

  const addressCandidates = [
    metadataRecord.agentAddress,
    metadataRecord.ownerAddress,
    metadataRecord.payTo,
    metadataRecord.agentAddressCaip,
    metadataRecord.nativeId,
    metadataRecord.address,
    metadataRecord.evmAddress,
    metadataRecord.uid,
  ];
  for (const candidate of addressCandidates) {
    const address = extractAddress(candidate);
    if (!address) {
      continue;
    }
    const weightedRegistry =
      registry === 'virtuals-protocol' || registry === 'moltbook';
    const weight =
      weightedRegistry && sources.some(source => source.kind === 'x') ? 0.3 : 1;
    push(sources, `address:${address}`, 'address', weight);
    break;
  }

  return sources;
}

const pickPrimaryUserkey = (
  sources: readonly Hcs25EthosSource[],
): string | null =>
  sources.find(source => source.kind === 'address')?.userkey ??
  sources[0]?.userkey ??
  null;

function readStoredSources(subject: Hcs25Subject): Hcs25EthosSource[] {
  const raw = subject.metadata?.ethosSources;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Hcs25EthosSource[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) {
      continue;
    }
    const record = entry as Record<string, Hcs25JsonValue>;
    const userkey = readString(record, 'userkey');
    if (!userkey) {
      continue;
    }
    const rawKind = readString(record, 'kind');
    const rawStatus = readString(record, 'status');
    const score = record.score;
    out.push({
      userkey,
      kind:
        rawKind === 'x' || rawKind === 'address' || rawKind === 'explicit'
          ? rawKind
          : userkeyKind(userkey),
      weight:
        typeof record.weight === 'number' && Number.isFinite(record.weight)
          ? Math.max(0, record.weight)
          : 1,
      status:
        rawStatus === 'ok' || rawStatus === 'error' ? rawStatus : 'missing',
      score: typeof score === 'number' && Number.isFinite(score) ? score : null,
      updatedAt: readString(record, 'updatedAt') ?? new Date(0).toISOString(),
    });
  }
  return out;
}

/**
 * Creates the `ethos` signal adapter: resolves the subject's Ethos userkeys
 * per the production derivation rules, fetches each source's score from the
 * Ethos v1 score endpoint (`{ok, data:{score}}` envelope), merges with the
 * stored `ethosSources` per-source freshness (TTL/failure-TTL gating), and
 * writes the `ethosUserkey`/`ethosScore`/`ethosScoreStatus`/`ethosSources`/
 * `ethosComposite` stored fields per the signal catalog.
 */
export function createEthosSignalAdapter(
  options: Hcs25EthosSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const baseUrl = stripTrailingSlashes(options.baseUrl ?? ETHOS_API_BASE_URL);
  const resolveSources = options.sources ?? deriveEthosSources;
  const ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000;
  const failureTtlMs = options.failureTtlMs ?? 6 * 60 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;
  const inferAddress = options.inferAddress ?? true;
  const clientId = options.client ?? DEFAULT_CLIENT_ID;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();

    const resolved = ((): Hcs25EthosSource[] => {
      const sources = resolveSources(subject);
      return inferAddress
        ? [...sources]
        : sources.filter(source => source.kind !== 'address');
    })();

    if (resolved.length === 0) {
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

    // Merge with stored sources: keep prior scores/statuses so a transient
    // failure does not erase data, and so TTL gating can skip fresh sources.
    const storedByUserkey = new Map(
      readStoredSources(subject).map(source => [source.userkey, source]),
    );
    const merged: Hcs25EthosSource[] = resolved.map(source => {
      const stored = storedByUserkey.get(source.userkey);
      return {
        ...source,
        status: stored?.status ?? source.status ?? 'missing',
        score: stored?.score ?? source.score ?? null,
        updatedAt: stored?.updatedAt ?? source.updatedAt,
      };
    });

    const toRefresh = merged.filter(source => {
      if (context.force) {
        return true;
      }
      const updatedMs = parseTimestampMs(source.updatedAt);
      if (updatedMs === null || updatedMs <= 0) {
        return true;
      }
      const ttl = source.status === 'ok' ? ttlMs : failureTtlMs;
      return context.now.getTime() - updatedMs >= ttl;
    });

    const headers: Record<string, string> = { 'X-Ethos-Client': clientId };
    let sawError = false;
    let sawTimeout = false;

    await Promise.all(
      toRefresh.map(async source => {
        const url = `${baseUrl}/api/v1/score/${encodeURIComponent(source.userkey)}`;
        try {
          const data = await requestJson<EthosScoreResponse>(url, {
            fetch: context.fetch,
            headers,
            timeoutMs: context.timeoutMs,
            signal: context.signal,
            maxRetries,
          });
          // Production envelope `{ok, data:{score}}`; tolerate a flat
          // `{score}` payload for v2-shaped endpoints.
          const score =
            typeof data?.data?.score === 'number' &&
            Number.isFinite(data.data.score)
              ? data.data.score
              : typeof data?.score === 'number' && Number.isFinite(data.score)
                ? data.score
                : null;
          source.updatedAt = now;
          if (data?.ok === false || score === null) {
            source.status = 'missing';
            source.score = null;
          } else {
            source.status = 'ok';
            source.score = score;
          }
        } catch (error) {
          source.updatedAt = now;
          if (error instanceof Hcs25CollectorHttpError) {
            if (error.status === 404) {
              source.status = 'missing';
              source.score = null;
            } else {
              source.status = 'error';
              // Preserve a previously stored score on transient failure.
              source.score = source.score ?? null;
              sawError = true;
            }
          } else if (isTimeoutError(error)) {
            source.status = 'error';
            sawTimeout = true;
            sawError = true;
          } else {
            source.status = 'error';
            sawError = true;
          }
        }
      }),
    );

    const scoredSources = merged.filter(
      source =>
        typeof source.score === 'number' && Number.isFinite(source.score),
    );
    const weightSum = scoredSources.reduce(
      (sum, source) => sum + Math.max(0, source.weight),
      0,
    );
    const composite =
      weightSum > 0
        ? Math.round(
            (scoredSources.reduce(
              (sum, source) => sum + source.weight * (source.score ?? 0),
              0,
            ) /
              weightSum) *
              100,
          ) / 100
        : null;

    const compositeStatus: EthosStoredStatus = merged.some(
      source => source.status === 'ok',
    )
      ? 'ok'
      : merged.some(source => source.status === 'error')
        ? 'error'
        : 'missing';

    // Composite weights are keyed by source kind (x/address/explicit).
    const weights: Record<string, number> = {};
    for (const source of merged) {
      weights[source.kind] =
        Math.round(((weights[source.kind] ?? 0) + source.weight) * 100) / 100;
    }

    const signalStatus =
      compositeStatus === 'ok'
        ? 'ok'
        : sawTimeout
          ? 'timeout'
          : compositeStatus === 'error'
            ? 'error'
            : 'missing';

    return [
      {
        signalId: 'ethos.score',
        status: signalStatus,
        value: composite,
        fields: [
          {
            scope: 'root',
            values: {
              ethosUserkey: pickPrimaryUserkey(merged),
              ethosScore: composite,
              ethosScoreStatus: compositeStatus,
              ethosScoreUpdatedAt: now,
              ethosSources: merged.map(source => ({
                userkey: source.userkey,
                kind: source.kind,
                weight: source.weight,
                status: source.status ?? 'missing',
                score: source.score ?? null,
                updatedAt: source.updatedAt ?? now,
              })),
              ethosComposite: {
                version: 1,
                score: composite,
                updatedAt: now,
                weights,
              },
            },
          },
        ],
        provenance: {
          source: 'ethos',
          sourceUrl: `${baseUrl}/api/v1/score`,
          subjectId: subject.id,
          fetchedAt: now,
          params: { userkeys: merged.map(source => source.userkey) },
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
    appliesTo: options.appliesTo ?? (subject => !isEthosExcluded(subject)),
    collect,
  };
}
