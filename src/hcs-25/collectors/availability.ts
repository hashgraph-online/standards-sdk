import type { Hcs25Subject } from '../types';
import { readMetadataRecord, readString } from '../signals';
import { resolveSubjectEndpoint } from './endpoints';
import { Hcs25CollectorHttpError, isTimeoutError } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

/**
 * Options for the availability signal adapter.
 */
export interface Hcs25AvailabilitySignalAdapterOptions {
  /** Custom endpoint resolver; defaults to {@link resolveSubjectEndpoint}. */
  resolveEndpoint?: (subject: Hcs25Subject) => string | null;
  /** Probe method. `auto` (default) tries HEAD and falls back to GET. */
  method?: 'auto' | 'HEAD' | 'GET';
  /** Per-probe timeout in milliseconds. */
  timeoutMs?: number;
  /** Extra request headers (e.g. auth for gated endpoints). */
  headers?: Record<string, string>;
  /** Applicability constraints. */
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_EXCLUDED_REGISTRIES: readonly string[] = [
  'openrouter',
  'near-ai',
];

function minutesSince(timestamp: string, now: Date): number | null {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) {
    return null;
  }
  return Math.max(0, (now.getTime() - ms) / 60000);
}

function missingResult(now: Date, reason: string): Hcs25SignalAdapterResult[] {
  return [
    {
      signalId: 'availability.probe',
      status: 'missing',
      fields: [
        {
          scope: 'root',
          values: {
            availabilityScore: null,
            availabilityCheckedAt: now.toISOString(),
            availabilityReason: reason,
            availabilitySource: 'probe',
            availabilityStatus: 'missing',
          },
        },
      ],
    },
  ];
}

/**
 * Creates the `availability` signal adapter: probes the subject's endpoint,
 * records reachability, latency, and probe provenance, and converts the
 * ecosystem-native `metrics.lastActiveAt` field into
 * `metrics.minsFromLastOnline` (the deterministic scoring adapter consumes
 * the derived field). Unreachable endpoints score 0; absent endpoints are
 * `missing`.
 */
export function createAvailabilitySignalAdapter(
  options: Hcs25AvailabilitySignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const resolveEndpoint = options.resolveEndpoint ?? resolveSubjectEndpoint;
  const method = options.method ?? 'auto';

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const { now } = context;
    const results: Hcs25SignalAdapterResult[] = [];

    const metrics = readMetadataRecord(subject, 'metrics');
    const lastActiveAt = metrics ? readString(metrics, 'lastActiveAt') : null;
    if (lastActiveAt !== null) {
      const mins = minutesSince(lastActiveAt, now);
      if (mins !== null) {
        results.push({
          signalId: 'availability.last_seen',
          status: 'ok',
          value: mins,
          fields: [{ scope: 'metrics', values: { minsFromLastOnline: mins } }],
          provenance: {
            source: 'metadata',
            subjectId: subject.id,
            fetchedAt: now.toISOString(),
          },
        });
      }
    }

    const endpoint = resolveEndpoint(subject);
    if (!endpoint) {
      if (results.length > 0) {
        return results;
      }
      return missingResult(now, 'no endpoint metadata');
    }

    const started = now.getTime();
    try {
      const attempt = async (verb: 'HEAD' | 'GET'): Promise<number> => {
        const response = await context.fetch(endpoint, {
          method: verb,
          headers: options.headers,
          signal: context.signal,
        });
        return response.status;
      };

      let status: number;
      if (method === 'auto') {
        try {
          status = await attempt('HEAD');
          if (status === 405 || status === 501) {
            status = await attempt('GET');
          }
        } catch (error) {
          if (error instanceof Hcs25CollectorHttpError) {
            throw error;
          }
          status = await attempt('GET');
        }
      } else {
        status = await attempt(method);
      }

      const latencyMs = Date.now() - started;
      const reachable = status < 500;
      results.push({
        signalId: 'availability.probe',
        status: 'ok',
        value: reachable ? 1 : 0,
        fields: [
          {
            scope: 'root',
            values: {
              availabilityScore: reachable ? 1 : 0,
              availabilityCheckedAt: now.toISOString(),
              availabilityLatencyMs: latencyMs,
              availabilityReason: reachable
                ? 'reachable'
                : `endpoint returned HTTP ${status}`,
              availabilitySource: 'probe',
              availabilityStatus: 'ok',
            },
          },
        ],
        provenance: {
          source: 'probe',
          sourceUrl: endpoint,
          subjectId: subject.id,
          fetchedAt: now.toISOString(),
        },
      });
      return results;
    } catch (error) {
      const timedOut = isTimeoutError(error);
      const statusValue = timedOut ? 'timeout' : 'error';
      results.push({
        signalId: 'availability.probe',
        status: statusValue,
        fields: [
          {
            scope: 'root',
            values: {
              availabilityCheckedAt: now.toISOString(),
              availabilityReason:
                error instanceof Error ? error.message : String(error),
              availabilitySource: 'probe',
              availabilityStatus: statusValue,
            },
          },
        ],
        provenance: {
          source: 'probe',
          sourceUrl: endpoint,
          subjectId: subject.id,
          fetchedAt: now.toISOString(),
        },
      });
      return results;
    }
  };

  return {
    id: 'availability',
    produces: ['availability.probe', 'availability.last_seen'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries,
    excludeRegistries: options.excludeRegistries ?? DEFAULT_EXCLUDED_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}
