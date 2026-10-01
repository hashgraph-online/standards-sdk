import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
  Hcs25SignalStatus,
} from './types';

/**
 * Parsed ERC-8004 feedback summary used by the scoring adapter.
 */
export interface Hcs25Erc8004FeedbackSummary {
  averageScore: number;
  totalFeedbacks: number;
  registry?: string;
  network?: string;
  updatedAt?: string;
}

/**
 * A feedback source: returns the summary for a subject or null when the
 * source has no data for it.
 */
export interface Hcs25Erc8004FeedbackSource {
  getFeedbackSummary(
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25Erc8004FeedbackSummary | null>;
}

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const parseNonNegativeInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 0 ? normalized : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

const parseChainIdFromNetworkKey = (networkKey: unknown): number | null => {
  if (typeof networkKey !== 'string') {
    return null;
  }
  const trimmed = networkKey.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^eip155:(\d+)(?::|$)/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseIdParts = (
  value: unknown,
): { chainId: number; agentId: string } | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const separator = trimmed.indexOf(':');
  if (separator <= 0 || separator !== trimmed.lastIndexOf(':')) {
    return null;
  }
  const chainId = Number.parseInt(trimmed.slice(0, separator), 10);
  const agentId = trimmed.slice(separator + 1);
  if (!Number.isFinite(chainId) || chainId <= 0 || !agentId) {
    return null;
  }
  return { chainId, agentId };
};

/**
 * Resolves the ERC-8004 `{chainId, agentId}` identity from subject metadata,
 * mirroring the registry-broker production adapter:
 *
 * 1. Explicit `metadata.agentId` + `metadata.chainId` (or
 *    `metadata.networkKey` such as `eip155:8453`).
 * 2. `metadata.originalId` / `metadata.nativeId` / `metadata.uid` in
 *    `{chainId}:{agentId}` form.
 */
export function parseErc8004NativeId(
  subject: Hcs25Subject,
): { chainId: number; agentId: string } | null {
  const metadata = subject.metadata ?? {};

  const idParts =
    parseIdParts(readString(metadata, 'originalId')) ??
    parseIdParts(readString(metadata, 'nativeId')) ??
    parseIdParts(readString(metadata, 'uid'));

  const agentId =
    parseNonNegativeInt(metadata['agentId']) ??
    (idParts ? parseNonNegativeInt(idParts.agentId) : null);
  const chainId =
    parsePositiveInt(metadata['chainId']) ??
    parseChainIdFromNetworkKey(metadata['networkKey']) ??
    idParts?.chainId ??
    null;

  if (agentId === null || chainId === null) {
    return null;
  }
  return { chainId, agentId: String(agentId) };
}

/**
 * Options for the HTTP indexer feedback source.
 */
export interface Hcs25Erc8004IndexerSourceOptions {
  /**
   * Indexer endpoint template; `{nativeId}`, `{chainId}`, and `{agentId}`
   * placeholders are substituted, or provide a function returning the URL.
   */
  endpoint: string | ((subject: Hcs25Subject) => string | null);
}

interface Erc8004IndexerResponse {
  averageScore?: number;
  totalFeedbacks?: number;
  count?: number;
  registry?: string;
  network?: string;
  updatedAt?: string;
  summary?: {
    averageScore?: number;
    totalFeedbacks?: number;
    registry?: string;
    network?: string;
    updatedAt?: string;
  };
}

/**
 * Creates a feedback source that queries an HTTP indexer exposing ERC-8004
 * reputation summaries as JSON.
 */
export function createHttpErc8004FeedbackSource(
  options: Hcs25Erc8004IndexerSourceOptions,
): Hcs25Erc8004FeedbackSource {
  return {
    async getFeedbackSummary(subject, context) {
      const nativeId = parseErc8004NativeId(subject);
      if (!nativeId) {
        return null;
      }
      const url =
        typeof options.endpoint === 'function'
          ? options.endpoint(subject)
          : options.endpoint
              .replace('{nativeId}', `${nativeId.chainId}:${nativeId.agentId}`)
              .replace('{chainId}', String(nativeId.chainId))
              .replace('{agentId}', nativeId.agentId);
      if (!url) {
        return null;
      }
      const data = await requestJson<Erc8004IndexerResponse>(url, {
        fetch: context.fetch,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
      const summary = data.summary ?? data;
      const averageScore =
        typeof summary.averageScore === 'number' ? summary.averageScore : null;
      const totalFeedbacks =
        typeof summary.totalFeedbacks === 'number'
          ? summary.totalFeedbacks
          : typeof (data as Erc8004IndexerResponse).count === 'number'
            ? (data as Erc8004IndexerResponse).count!
            : null;
      if (averageScore === null && totalFeedbacks === null) {
        return null;
      }
      return {
        averageScore: averageScore ?? 0,
        totalFeedbacks: totalFeedbacks ?? 0,
        registry: summary.registry ?? 'erc-8004',
        network: summary.network ?? String(nativeId.chainId),
        updatedAt: summary.updatedAt,
      };
    },
  };
}

const ERC8004_REPUTATION_ABI = [
  'function getClients(uint256 agentId) view returns (address[])',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
] as const;

/**
 * Minimal contract-call surface needed from an ethers provider/signer or a
 * duck-typed `ethers.Contract`. Callers may also pass a fully custom
 * `readContract` implementation.
 */
export interface Hcs25Erc8004ContractCaller {
  getClients(agentId: bigint): Promise<readonly string[]>;
  getSummary(
    agentId: bigint,
    clientAddresses: readonly string[],
    tag1: string,
    tag2: string,
  ): Promise<readonly [bigint, bigint, bigint]>;
}

/**
 * Options for the on-chain feedback source (EVM ERC-8004 networks).
 */
export interface Hcs25Erc8004OnchainSourceOptions {
  /**
   * Registry contract address per chainId (e.g. `{11155111: '0x…'}`).
   */
  registries: Record<number, string>;
  /**
   * Contract factory per chainId: `(registryAddress, agentId)` → caller.
   * Build it with ethers: `new ethers.Contract(addr, ERC8004_ABI, provider)`.
   */
  contractFor: (
    chainId: number,
    registry: string,
  ) => Hcs25Erc8004ContractCaller;
  /**
   * Interpretation of the raw summary value: `auto` treats values ≤5 as a
   * 0–5 scale scaled ×20, ≤100 as already 0–100.
   */
  scoreScale?: 'auto' | 'ratio5' | 'percent';
  tag1?: string;
  tag2?: string;
}

/**
 * Creates a feedback source that reads the ERC-8004 Reputation Registry
 * contract directly: `getClients(agentId)` then
 * `getSummary(agentId, clients, tag1, tag2)`.
 */
export function createOnchainErc8004FeedbackSource(
  options: Hcs25Erc8004OnchainSourceOptions,
): Hcs25Erc8004FeedbackSource {
  const scoreScale = options.scoreScale ?? 'auto';
  return {
    async getFeedbackSummary(subject) {
      const nativeId = parseErc8004NativeId(subject);
      if (!nativeId) {
        return null;
      }
      const registry = options.registries[nativeId.chainId];
      if (!registry) {
        return null;
      }
      const contract = options.contractFor(nativeId.chainId, registry);
      const agentId = BigInt(nativeId.agentId);
      const clients = await contract.getClients(agentId);
      if (clients.length === 0) {
        return {
          averageScore: 0,
          totalFeedbacks: 0,
          network: String(nativeId.chainId),
        };
      }
      const [count, summaryValue, decimals] = await contract.getSummary(
        agentId,
        [...clients],
        options.tag1 ?? '',
        options.tag2 ?? '',
      );
      const raw = Number(summaryValue) / 10 ** Number(decimals);
      const averageScore =
        scoreScale === 'ratio5'
          ? raw * 20
          : scoreScale === 'percent'
            ? raw
            : raw <= 5
              ? raw * 20
              : raw;
      return {
        averageScore: Math.min(100, Math.max(0, averageScore)),
        totalFeedbacks: Number(count),
        network: String(nativeId.chainId),
      };
    },
  };
}

/**
 * Options for the ERC-8004 feedback signal adapter.
 */
export interface Hcs25Erc8004SignalAdapterOptions {
  /** One or more feedback sources; the first non-null summary wins. */
  sources: readonly Hcs25Erc8004FeedbackSource[];
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['erc-8004'];

function statusFromError(error: unknown): Hcs25SignalStatus {
  return isTimeoutError(error) ? 'timeout' : 'error';
}

/**
 * Creates the `erc8004-feedback` signal adapter: resolves the subject's
 * `chainId:agentId` identity, queries configured feedback sources (HTTP
 * indexer and/or on-chain via ethers), and writes
 * `metadata.erc8004FeedbackSummary`.
 */
export function createErc8004SignalAdapter(
  options: Hcs25Erc8004SignalAdapterOptions,
): Hcs25SignalAdapter {
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const nativeId = parseErc8004NativeId(subject);
    if (!nativeId) {
      return [{ signalId: 'erc8004.feedback', status: 'missing' }];
    }

    let lastError: unknown = null;
    for (const source of options.sources) {
      try {
        const summary = await source.getFeedbackSummary(subject, context);
        if (!summary) {
          continue;
        }
        const averageScore = Math.min(
          100,
          Math.max(0, Number(summary.averageScore) || 0),
        );
        const totalFeedbacks = Math.max(
          0,
          Math.floor(Number(summary.totalFeedbacks) || 0),
        );
        const record: Record<string, Hcs25JsonValue> = {
          averageScore,
          totalFeedbacks,
          registry: summary.registry ?? subject.registry ?? 'erc-8004',
          network: summary.network ?? String(nativeId.chainId),
          updatedAt: summary.updatedAt ?? now,
        };
        return [
          {
            signalId: 'erc8004.feedback',
            status: 'ok',
            value: averageScore,
            fields: [{ scope: 'erc8004FeedbackSummary', values: record }],
            provenance: {
              source: 'erc8004',
              subjectId: `${nativeId.chainId}:${nativeId.agentId}`,
              fetchedAt: now,
            },
          },
        ];
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (lastError) {
      if (
        lastError instanceof Hcs25CollectorHttpError &&
        lastError.status === 404
      ) {
        return [{ signalId: 'erc8004.feedback', status: 'missing' }];
      }
      return [
        {
          signalId: 'erc8004.feedback',
          status: statusFromError(lastError),
        },
      ];
    }
    return [{ signalId: 'erc8004.feedback', status: 'missing' }];
  };

  return {
    id: 'erc8004-feedback',
    produces: ['erc8004.feedback'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}

export { ERC8004_REPUTATION_ABI };
