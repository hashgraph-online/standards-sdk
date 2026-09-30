import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject, readMetadataRecord, readString } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

/**
 * Options for the x402 usage signal adapter.
 */
export interface Hcs25X402SignalAdapterOptions {
  /**
   * Usage endpoint: a URL template supporting `{payTo}`, `{asset}`, and
   * `{network}` placeholders, or a function returning the URL (return null
   * to mark the signal missing).
   */
  endpoint: string | ((subject: Hcs25Subject) => string | null);
  /** Per-adapter timeout in milliseconds. */
  timeoutMs?: number;
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

interface X402UsageResponse {
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

function hasX402Config(subject: Hcs25Subject): boolean {
  const metadata = subject.metadata ?? {};
  if (
    readString(metadata, 'payTo') !== null ||
    isJsonObject(metadata.x402UsageSummary)
  ) {
    return true;
  }
  const proto = subject.protocol?.toLowerCase();
  return proto === 'x402';
}

function readCursor(subject: Hcs25Subject): Hcs25JsonValue | undefined {
  const cursor = readMetadataRecord(subject, 'x402UsageCursor');
  if (!cursor) {
    const raw = subject.metadata?.x402UsageCursor;
    return raw === undefined ? undefined : raw;
  }
  return cursor;
}

/**
 * Creates the `x402` signal adapter: queries a usage indexer for on-chain
 * x402 payment activity (USD volume + trade counts) and stores the summary
 * plus cursor for incremental refresh, per the signal catalog.
 */
export function createX402SignalAdapter(
  options: Hcs25X402SignalAdapterOptions,
): Hcs25SignalAdapter {
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const metadata = subject.metadata ?? {};
    const payTo = readString(metadata, 'payTo');
    const asset = readString(metadata, 'asset');
    const network = readString(metadata, 'network');

    const url =
      typeof options.endpoint === 'function'
        ? options.endpoint(subject)
        : options.endpoint
            .replace('{payTo}', encodeURIComponent(payTo ?? ''))
            .replace('{asset}', encodeURIComponent(asset ?? ''))
            .replace('{network}', encodeURIComponent(network ?? ''));

    if (!url) {
      return [{ signalId: 'x402.usage', status: 'missing' }];
    }

    const cursor = readCursor(subject);
    const urlWithCursor =
      cursor && isJsonObject(cursor) && typeof cursor.cursor === 'string'
        ? `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor.cursor)}`
        : url;

    try {
      const data = await requestJson<X402UsageResponse>(urlWithCursor, {
        fetch: context.fetch,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
      const summary = data.summary ?? data;
      const values: Record<string, Hcs25JsonValue> = {
        x402UsageStatus: 'ok',
        x402UsageUpdatedAt: now,
        x402UsageSource: 'onchain',
        x402UsageSummary: {
          volume7dUsd: summary.volume7dUsd ?? null,
          volume24hUsd: summary.volume24hUsd ?? null,
          inboundTrades7d: summary.inboundTrades7d ?? null,
          outboundTrades7d: summary.outboundTrades7d ?? null,
        },
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
            subjectId: subject.id,
            fetchedAt: now,
          },
        },
      ];
    } catch (error) {
      if (error instanceof Hcs25CollectorHttpError && error.status === 404) {
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
                },
              },
            ],
          },
        ];
      }
      const status = isTimeoutError(error) ? 'timeout' : 'error';
      return [
        {
          signalId: 'x402.usage',
          status,
          fields: [
            {
              scope: 'root',
              values: {
                x402UsageStatus: 'error',
                x402UsageUpdatedAt: now,
                x402UsageSource: 'onchain',
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
    appliesTo: options.appliesTo ?? hasX402Config,
    collect,
  };
}
