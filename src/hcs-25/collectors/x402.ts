import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject, readString } from '../signals';
import { parseTimestampMs } from './freshness';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';
import {
  fetchX402OnchainUsageState,
  type Hcs25X402OnchainUsageOptions,
  type Hcs25X402UsageStateParams,
  type Hcs25X402UsageStateResult,
  type Hcs25X402UsageSummary,
} from './x402-onchain';

/**
 * Pluggable usage-state fetcher (the on-chain scanner by default; inject a
 * stub in tests or a custom implementation for other networks).
 */
export type Hcs25X402UsageStateFetcher = (
  params: Hcs25X402UsageStateParams,
  options: Hcs25X402OnchainUsageOptions,
) => Promise<Hcs25X402UsageStateResult>;

/**
 * Options for the x402 usage signal adapter.
 */
export interface Hcs25X402SignalAdapterOptions
  extends Hcs25X402OnchainUsageOptions {
  /**
   * Usage source:
   * - `'onchain'` (default): scans ERC-20 `Transfer` events to/from
   *   `metadata.payTo` on the `metadata.network` chain via viem.
   * - a URL template with `{payTo}`/`{asset}`/`{network}` placeholders, or a
   *   function returning a URL: queries an HTTP usage indexer instead.
   */
  source?: 'onchain' | string | ((subject: Hcs25Subject) => string | null);
  /**
   * Fully custom usage-state source (e.g. a hosted scanner or a test stub).
   * Overrides `source` when provided.
   */
  fetchUsageState?: Hcs25X402UsageStateFetcher;
  /**
   * Refresh interval applied when the stored `x402UsageStatus` is `ok`.
   * Default 6 hours. The scan is skipped (and the stored summary echoed)
   * while fresh.
   */
  ttlMs?: number;
  /**
   * Refresh interval applied after non-`ok` states. Default 3 hours.
   */
  failureTtlMs?: number;
  /** Per-adapter timeout in milliseconds. */
  timeoutMs?: number;
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

interface X402IndexerResponse {
  volume7dUsd?: number;
  volume24hUsd?: number;
  inboundTrades7d?: number;
  outboundTrades7d?: number;
  cursor?: Hcs25JsonValue;
  summary?: {
    volume7dUsd?: number;
    volume24hUsd?: number;
    inboundTrades7d?: number;
    outboundTrades7d?: number;
  };
}

const summaryValues = (
  summary: Partial<Hcs25X402UsageSummary> | null,
): Record<string, Hcs25JsonValue> => ({
  x402UsageSummary: summary
    ? {
        volume7dUsd: summary.volume7dUsd ?? 0,
        volume24hUsd: summary.volume24hUsd ?? 0,
        inboundTrades7d: summary.inboundTrades7d ?? 0,
        outboundTrades7d: summary.outboundTrades7d ?? 0,
      }
    : null,
});

function hasProtocol(subject: Hcs25Subject, wanted: string): boolean {
  const normalized = wanted.toLowerCase();
  const direct = subject.protocol?.toLowerCase();
  if (direct === normalized) {
    return true;
  }
  const metadataProtocol =
    typeof subject.metadata?.protocol === 'string'
      ? subject.metadata.protocol.toLowerCase()
      : null;
  if (metadataProtocol === normalized) {
    return true;
  }
  const list = (subject as { protocols?: unknown }).protocols;
  return (
    Array.isArray(list) &&
    list.some(
      entry => typeof entry === 'string' && entry.toLowerCase() === normalized,
    )
  );
}

function hasX402Config(subject: Hcs25Subject): boolean {
  const metadata = subject.metadata ?? {};
  const configured =
    readString(metadata, 'payTo') !== null &&
    readString(metadata, 'asset') !== null &&
    readString(metadata, 'network') !== null;
  return configured || hasProtocol(subject, 'x402');
}

function readCursor(subject: Hcs25Subject): Hcs25JsonValue | undefined {
  const raw = subject.metadata?.x402UsageCursor;
  return raw === undefined ? undefined : raw;
}

/**
 * Creates the `x402` signal adapter: scans on-chain x402 payment activity
 * (USD volume + trade counts, chunked `Transfer` log scans resumable via
 * `x402UsageCursor`) or queries a configured HTTP usage indexer, and stores
 * the `x402Usage*` fields per the signal catalog. Fresh `ok` refreshes are
 * skipped per `ttlMs`/`failureTtlMs` unless `context.force` is set.
 */
export function createX402SignalAdapter(
  options: Hcs25X402SignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const source = options.source ?? 'onchain';
  const ttlMs = options.ttlMs ?? 6 * 60 * 60 * 1000;
  const failureTtlMs = options.failureTtlMs ?? 3 * 60 * 60 * 1000;

  const fetchUsage: Hcs25X402UsageStateFetcher =
    options.fetchUsageState ?? fetchX402OnchainUsageState;
  const isHttpSource = typeof source === 'string' && source !== 'onchain';
  const isUrlFn = typeof source === 'function';

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const metadata = subject.metadata ?? {};
    const payTo = readString(metadata, 'payTo');
    const asset = readString(metadata, 'asset');
    const network = readString(metadata, 'network');
    const cursor = readCursor(subject);

    // Freshness gate: skip the scan while stored fields are still fresh and
    // echo the stored summary so provenance keeps the original fetchedAt.
    if (!context.force) {
      const storedStatus = readString(metadata, 'x402UsageStatus');
      const storedUpdatedMs = parseTimestampMs(metadata.x402UsageUpdatedAt);
      if (storedStatus && storedUpdatedMs !== null) {
        const ttl = storedStatus === 'ok' ? ttlMs : failureTtlMs;
        if (context.now.getTime() - storedUpdatedMs < ttl) {
          const storedSummary = isJsonObject(metadata.x402UsageSummary)
            ? (metadata.x402UsageSummary as Record<string, Hcs25JsonValue>)
            : null;
          return [
            {
              signalId: 'x402.usage',
              status: storedStatus === 'ok' ? 'ok' : 'missing',
              value:
                storedSummary && typeof storedSummary.volume7dUsd === 'number'
                  ? storedSummary.volume7dUsd
                  : null,
              provenance: {
                source: 'x402',
                subjectId: payTo ?? subject.id,
                fetchedAt: metadata.x402UsageUpdatedAt as string,
              },
            },
          ];
        }
      }
    }

    if (!options.fetchUsageState && (isHttpSource || isUrlFn)) {
      const resolved = isUrlFn
        ? (source as (s: Hcs25Subject) => string | null)(subject)
        : (source as string)
            .replace('{payTo}', encodeURIComponent(payTo ?? ''))
            .replace('{asset}', encodeURIComponent(asset ?? ''))
            .replace('{network}', encodeURIComponent(network ?? ''));
      const url = typeof resolved === 'string' ? resolved : null;

      if (!url) {
        return [{ signalId: 'x402.usage', status: 'missing' }];
      }
      const urlWithCursor =
        cursor && isJsonObject(cursor) && typeof cursor.cursor === 'string'
          ? `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor.cursor)}`
          : url;
      try {
        const data = await requestJson<X402IndexerResponse>(urlWithCursor, {
          fetch: context.fetch,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        });
        const summary = data.summary ?? data;
        const values: Record<string, Hcs25JsonValue> = {
          x402UsageStatus: 'ok',
          x402UsageUpdatedAt: now,
          x402UsageSource: 'indexer',
          ...summaryValues(summary),
        };
        const nextCursor = data.cursor ?? cursor;
        if (nextCursor !== undefined) {
          values.x402UsageCursor = nextCursor;
        }
        return [
          {
            signalId: 'x402.usage',
            status: 'ok',
            value: summary.volume7dUsd ?? null,
            fields: [{ scope: 'root', values }],
            provenance: {
              source: 'x402',
              sourceUrl: url,
              subjectId: payTo ?? subject.id,
              fetchedAt: now,
            },
          },
        ];
      } catch (error) {
        const missing =
          error instanceof Hcs25CollectorHttpError && error.status === 404;
        const status = missing
          ? 'missing'
          : isTimeoutError(error)
            ? 'timeout'
            : 'error';
        return [
          {
            signalId: 'x402.usage',
            status,
            fields: [
              {
                scope: 'root',
                values: {
                  x402UsageStatus: missing ? 'missing' : 'error',
                  x402UsageUpdatedAt: now,
                  x402UsageSource: 'indexer',
                },
              },
            ],
          },
        ];
      }
    }

    // On-chain scan (default, matching the production implementation).
    if (!payTo || !asset || !network) {
      return [
        {
          signalId: 'x402.usage',
          status: 'missing',
          fields: [
            {
              scope: 'root',
              values: {
                x402UsageStatus: 'missing',
                x402UsageUpdatedAt: now,
                x402UsageSource: 'onchain',
                x402UsageSummary: null,
              },
            },
          ],
        },
      ];
    }

    try {
      const { summary, cursor: nextCursor } = await fetchUsage(
        { network, asset, payTo, cursor },
        {
          days: options.days,
          ttlMs: options.ttlMs,
          maxRetries: options.maxRetries,
          chunkSizeBlocks: options.chunkSizeBlocks,
          rpcUrls: options.rpcUrls,
        },
      );
      const values: Record<string, Hcs25JsonValue> = {
        x402UsageStatus: summary ? 'ok' : 'missing',
        x402UsageUpdatedAt: now,
        x402UsageSource: 'onchain',
        ...summaryValues(summary),
      };
      if (nextCursor !== null) {
        values.x402UsageCursor = nextCursor as unknown as Hcs25JsonValue;
      } else if (cursor !== undefined) {
        values.x402UsageCursor = cursor;
      }
      return [
        {
          signalId: 'x402.usage',
          status: summary ? 'ok' : 'missing',
          value: summary?.volume7dUsd ?? null,
          fields: [{ scope: 'root', values }],
          provenance: {
            source: 'x402',
            subjectId: payTo,
            fetchedAt: now,
            params: { network, asset, source: 'onchain' },
          },
        },
      ];
    } catch (error) {
      return [
        {
          signalId: 'x402.usage',
          status: isTimeoutError(error) ? 'timeout' : 'error',
          fields: [
            {
              scope: 'root',
              values: {
                x402UsageStatus: 'error',
                x402UsageUpdatedAt: now,
                x402UsageSource: 'onchain',
                x402UsageSummary: null,
                ...(cursor !== undefined ? { x402UsageCursor: cursor } : {}),
              },
            },
          ],
        },
      ];
    }
  };

  return {
    id: 'x402',
    produces: ['x402.usage'],
    timeoutMs: options.timeoutMs,
    // On-chain scans need network+asset+payTo; HTTP/custom sources only
    // need a payTo (or the x402 protocol marker) to query.
    appliesTo:
      options.appliesTo ??
      ((subject: Hcs25Subject): boolean => {
        if (hasX402Config(subject)) {
          return true;
        }
        if (
          !isHttpSource &&
          !isUrlFn &&
          options.fetchUsageState === undefined
        ) {
          return false;
        }
        return readString(subject.metadata ?? {}, 'payTo') !== null;
      }),
    collect,
  };
}
