import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

/**
 * Marketplace-native performance metrics consumed by the `acp` scoring
 * adapter (stored under `metadata.metrics` with top-level fallbacks).
 */
export interface Hcs25AcpMetrics {
  successRate?: number;
  successfulJobCount?: number;
  totalJobCount?: number;
  volume?: number;
  revenue?: number;
  rating?: number;
}

/**
 * Options for the ACP/Virtuals signal adapter.
 */
export interface Hcs25AcpSignalAdapterOptions {
  /**
   * Marketplace endpoint: a URL template supporting `{address}` /
   * `{nativeId}` placeholders, or a function returning the URL (null =
   * not listed in the marketplace).
   */
  endpoint: string | ((subject: Hcs25Subject) => string | null);
  /**
   * Maps the marketplace response JSON to normalized metrics. Default reads
   * the metric keys from the payload root, `.metrics`, or `.agent`.
   */
  mapResponse?: (data: unknown) => Hcs25AcpMetrics | null;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['virtuals-protocol'];

const METRIC_KEYS = [
  'successRate',
  'successfulJobCount',
  'totalJobCount',
  'volume',
  'revenue',
  'rating',
] as const;

function pickMetrics(record: unknown): Hcs25AcpMetrics | null {
  if (typeof record !== 'object' || record === null) {
    return null;
  }
  const source = record as Record<string, unknown>;
  const metrics: Hcs25AcpMetrics = {};
  let found = false;
  for (const key of METRIC_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      metrics[key] = value;
      found = true;
    }
  }
  return found ? metrics : null;
}

function defaultMapResponse(data: unknown): Hcs25AcpMetrics | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const root = data as Record<string, unknown>;
  return (
    pickMetrics(root.metrics) ?? pickMetrics(root.agent) ?? pickMetrics(root)
  );
}

function resolveAgentAddress(subject: Hcs25Subject): string | null {
  const metadata = subject.metadata ?? {};
  for (const key of ['nativeId', 'address', 'uid']) {
    const value = readString(metadata, key);
    if (value) {
      return value;
    }
  }
  return null;
}

/**
 * Creates the `acp` signal adapter: fetches marketplace-native recent
 * performance metrics for ACP/Virtuals-style agents and stores them under
 * `metadata.metrics` (with `successRate`/`successfulJobCount` top-level
 * fallbacks per the signal catalog).
 */
export function createAcpSignalAdapter(
  options: Hcs25AcpSignalAdapterOptions,
): Hcs25SignalAdapter {
  const mapResponse = options.mapResponse ?? defaultMapResponse;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const address = resolveAgentAddress(subject) ?? subject.id;
    const url =
      typeof options.endpoint === 'function'
        ? options.endpoint(subject)
        : options.endpoint
            .replace('{address}', encodeURIComponent(address))
            .replace('{nativeId}', encodeURIComponent(address));

    if (!url) {
      return [{ signalId: 'acp.metrics', status: 'missing' }];
    }

    try {
      const data = await requestJson(url, {
        fetch: context.fetch,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
      const metrics = mapResponse(data);
      if (!metrics) {
        return [{ signalId: 'acp.metrics', status: 'missing' }];
      }

      const metricsValues: Record<string, Hcs25JsonValue> = {};
      for (const key of METRIC_KEYS) {
        const value = metrics[key];
        if (value !== undefined) {
          metricsValues[key] = value;
        }
      }
      const rootValues: Record<string, Hcs25JsonValue> = {};
      if (metrics.successRate !== undefined) {
        rootValues.successRate = metrics.successRate;
      }
      if (metrics.successfulJobCount !== undefined) {
        rootValues.successfulJobCount = metrics.successfulJobCount;
      }

      return [
        {
          signalId: 'acp.metrics',
          status: 'ok',
          value: metrics.successRate ?? null,
          fields: [
            { scope: 'metrics', values: metricsValues },
            { scope: 'root', values: rootValues },
          ],
          provenance: {
            source: 'acp',
            sourceUrl: url,
            subjectId: address,
            fetchedAt: now,
          },
        },
      ];
    } catch (error) {
      if (error instanceof Hcs25CollectorHttpError && error.status === 404) {
        return [{ signalId: 'acp.metrics', status: 'missing' }];
      }
      return [
        {
          signalId: 'acp.metrics',
          status: isTimeoutError(error) ? 'timeout' : 'error',
        },
      ];
    }
  };

  return {
    id: 'acp',
    produces: ['acp.metrics'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
