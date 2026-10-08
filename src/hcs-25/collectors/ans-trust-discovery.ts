import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import {
  readMetadataRecord,
  readNumber,
  readString,
  type Hcs25JsonObject,
} from '../signals';
import { HCS25_ANS_TRUST_DISCOVERY_SIGNALS } from '../signals/ans-trust-discovery';
import { shouldRefreshStoredFields } from './freshness';
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

/**
 * Provider listed in the ANS Trust Discovery signal specification.
 * Callers can point {@link Hcs25AnsTrustDiscoverySignalAdapterOptions.baseUrl}
 * at another provider that serves the same response shape.
 */
const DEFAULT_ANS_BASE_URL = 'https://api.godaddy.com';

const SOURCE_ID = 'ans-trust-discovery';

const SIGNAL_IDS = HCS25_ANS_TRUST_DISCOVERY_SIGNALS.map(
  signal => `ans-trust-discovery.${signal}`,
);

/**
 * Options for the ANS Trust Discovery signal adapter.
 */
export interface Hcs25AnsTrustDiscoverySignalAdapterOptions {
  /**
   * ANS Trust Index origin. Requests
   * `GET {baseUrl}/v1/ans/registered-agents/{agentId}`.
   * Default `https://api.godaddy.com`.
   */
  baseUrl?: string;
  /** Extra request headers, such as a provider credential. */
  headers?: Record<string, string>;
  /**
   * Resolves the provider agent id: the ANS agent id carried as the UAID
   * `uid` parameter (HCS-14 `ans-dns-web` profile). Default reads
   * `metadata.uid`, then the `uid` parameter of the UAID in
   * `metadata.uaidFull`, then of `subject.id`. `nativeId` is not an agent id
   * and is never used.
   */
  resolveAgentId?: (subject: Hcs25Subject) => string | null;
  timeoutMs?: number;
  /** Refresh interval after a successful collection. Default 24 hours. */
  ttlMs?: number;
  /** Refresh interval after a failed collection. Default 1 hour. */
  failureTtlMs?: number;
  /**
   * Retries for network errors and HTTP 5xx. Default 2. HTTP 429 is not
   * retried; the refresh intervals bound the request rate instead.
   */
  maxRetries?: number;
  /**
   * Default `['ans', 'godaddy-ans']`: `ans` is the HCS-14 registry value and
   * `godaddy-ans` is the Registry Broker namespace for the same agents.
   */
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['ans', 'godaddy-ans'];

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FAILURE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 2;

interface AnsSignalPayload {
  score?: unknown;
  missing?: unknown;
}

interface AnsTrustResponse {
  signals?: Record<string, AnsSignalPayload>;
}

/**
 * Reads one parameter from a UAID's `;key=value` list. Parameter names are
 * case-sensitive, as in HCS-14.
 */
function readUaidParam(uaid: string | null, key: string): string | null {
  if (!uaid) {
    return null;
  }
  for (const param of uaid.split(';').slice(1)) {
    const separator = param.indexOf('=');
    if (separator > 0 && param.slice(0, separator) === key) {
      return param.slice(separator + 1);
    }
  }
  return null;
}

/**
 * Treats an empty or unspecified (`0`) agent id as absent.
 */
function agentIdOrNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '0' ? trimmed : null;
}

function defaultResolveAgentId(subject: Hcs25Subject): string | null {
  const metadata = subject.metadata ?? {};
  return (
    agentIdOrNull(readString(metadata, 'uid')) ??
    agentIdOrNull(readUaidParam(readString(metadata, 'uaidFull'), 'uid')) ??
    agentIdOrNull(readUaidParam(subject.id, 'uid'))
  );
}

function readSignalScore(payload: AnsSignalPayload | undefined): number | null {
  if (!payload || payload.missing === true) {
    return null;
  }
  const score = payload.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null;
  }
  return Math.min(100, Math.max(0, score));
}

function statusResult(
  status: 'missing' | 'timeout' | 'error',
  now: string,
  url: string | undefined,
  agentId: string | undefined,
  values?: Record<string, Hcs25JsonValue>,
): Hcs25SignalAdapterResult[] {
  const provenance = {
    source: SOURCE_ID,
    sourceUrl: url,
    subjectId: agentId,
    fetchedAt: now,
  };
  const fields = values ? [{ scope: 'ansTrustDiscovery', values }] : undefined;
  return SIGNAL_IDS.map((signalId, index) => ({
    signalId,
    status,
    fields: index === 0 ? fields : undefined,
    provenance,
  }));
}

/**
 * Stored fields for an agent the provider does not know (HTTP 404): every
 * score is cleared so earlier values stop counting.
 */
function clearedValues(now: string): Record<string, Hcs25JsonValue> {
  const values: Record<string, Hcs25JsonValue> = {};
  for (const signalId of SIGNAL_IDS) {
    values[signalId] = null;
  }
  values.ansTrustDiscoveryStatus = 'missing';
  values.ansTrustDiscoveryUpdatedAt = now;
  return values;
}

/**
 * Reports the stored signals without a request while they are within their
 * refresh interval.
 */
function storedResult(
  record: Hcs25JsonObject,
  url: string,
  agentId: string,
): Hcs25SignalAdapterResult[] {
  const storedStatus = readString(record, 'ansTrustDiscoveryStatus');
  const provenance = {
    source: SOURCE_ID,
    sourceUrl: url,
    subjectId: agentId,
    fetchedAt: readString(record, 'ansTrustDiscoveryUpdatedAt') ?? undefined,
  };
  return SIGNAL_IDS.map((signalId): Hcs25SignalAdapterResult => {
    if (storedStatus === 'timeout' || storedStatus === 'error') {
      return { signalId, status: storedStatus, provenance };
    }
    const score = readNumber(record, signalId);
    if (score === null) {
      return { signalId, status: 'missing', provenance };
    }
    return { signalId, status: 'ok', value: score, provenance };
  });
}

/**
 * Creates the `ans-trust-discovery` signal adapter: reads the eight ANS
 * Trust Index signals from a provider's registered-agent endpoint and
 * stores them under `metadata.ansTrustDiscovery`.
 */
export function createAnsTrustDiscoverySignalAdapter(
  options: Hcs25AnsTrustDiscoverySignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const resolveAgentId = options.resolveAgentId ?? defaultResolveAgentId;
  const baseUrl = stripTrailingSlashes(options.baseUrl ?? DEFAULT_ANS_BASE_URL);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const agentId = resolveAgentId(subject);
    if (!agentId) {
      return statusResult('missing', now, undefined, undefined);
    }

    const url = `${baseUrl}/v1/ans/registered-agents/${encodeURIComponent(agentId)}`;
    const stored = readMetadataRecord(subject, 'ansTrustDiscovery');
    if (
      stored &&
      !shouldRefreshStoredFields(subject, {
        scope: 'ansTrustDiscovery',
        statusKey: 'ansTrustDiscoveryStatus',
        updatedAtKey: 'ansTrustDiscoveryUpdatedAt',
        ttlMs,
        failureTtlMs,
        now: context.now,
        force: context.force,
      })
    ) {
      return storedResult(stored, url, agentId);
    }

    let data: AnsTrustResponse;
    try {
      data = await requestJson<AnsTrustResponse>(url, {
        fetch: context.fetch,
        headers: options.headers,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
        maxRetries,
      });
    } catch (error) {
      if (error instanceof Hcs25CollectorHttpError && error.status === 404) {
        return statusResult('missing', now, url, agentId, clearedValues(now));
      }
      const status = isTimeoutError(error) ? 'timeout' : 'error';
      return statusResult(status, now, url, agentId, {
        ansTrustDiscoveryStatus: status,
        ansTrustDiscoveryUpdatedAt: now,
      });
    }

    const signals = data.signals;
    const values: Record<string, Hcs25JsonValue> = {
      ansTrustDiscoveryUpdatedAt: now,
    };
    let present = 0;
    const results: Hcs25SignalAdapterResult[] = [];

    for (const signal of HCS25_ANS_TRUST_DISCOVERY_SIGNALS) {
      const payload =
        signals && typeof signals === 'object' ? signals[signal] : undefined;
      const score = readSignalScore(payload);
      const signalId = `ans-trust-discovery.${signal}`;
      values[signalId] = score;
      if (score !== null) {
        present += 1;
      }
      results.push({
        signalId,
        status: score === null ? 'missing' : 'ok',
        value: score ?? undefined,
        provenance: {
          source: SOURCE_ID,
          sourceUrl: url,
          subjectId: agentId,
          fetchedAt: now,
        },
      });
    }

    values.ansTrustDiscoveryStatus = present > 0 ? 'ok' : 'missing';
    const carrier =
      results.find(result => result.status === 'ok') ?? results[0];
    carrier.fields = [{ scope: 'ansTrustDiscovery', values }];
    return results;
  };

  return {
    id: SOURCE_ID,
    produces: SIGNAL_IDS,
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
