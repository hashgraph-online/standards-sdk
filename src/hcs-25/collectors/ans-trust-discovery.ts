import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString } from '../signals';
import { HCS25_ANS_TRUST_DISCOVERY_SIGNALS } from '../signals/ans-trust-discovery';
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
   * Resolves the provider agent id. Default reads `metadata.nativeId`,
   * then the `nativeId` parameter of a UAID in `subject.id` or
   * `metadata.uaidFull`.
   */
  resolveAgentId?: (subject: Hcs25Subject) => string | null;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['ans'];

interface AnsSignalPayload {
  score?: unknown;
  missing?: unknown;
}

interface AnsTrustResponse {
  signals?: Record<string, AnsSignalPayload>;
}

function nativeIdFromUaid(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const nativeId = value.match(/(?:^|;)nativeId=([^;]+)(?:;|$)/i)?.[1]?.trim();
  if (!nativeId) {
    return null;
  }
  try {
    return decodeURIComponent(nativeId);
  } catch {
    return nativeId;
  }
}

function defaultResolveAgentId(subject: Hcs25Subject): string | null {
  const metadata = subject.metadata ?? {};
  return (
    readString(metadata, 'nativeId') ??
    nativeIdFromUaid(subject.id) ??
    nativeIdFromUaid(readString(metadata, 'uaidFull'))
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
): Hcs25SignalAdapterResult[] {
  return [
    {
      signalId: SIGNAL_IDS[0],
      status,
      fields:
        status === 'missing'
          ? undefined
          : [
              {
                scope: 'ansTrustDiscovery',
                values: {
                  ansTrustDiscoveryStatus: status,
                  ansTrustDiscoveryUpdatedAt: now,
                },
              },
            ],
      provenance: {
        source: 'ans-trust-discovery',
        sourceUrl: url,
        subjectId: agentId,
        fetchedAt: now,
      },
    },
  ];
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
    let data: AnsTrustResponse;
    try {
      data = await requestJson<AnsTrustResponse>(url, {
        fetch: context.fetch,
        headers: options.headers,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
    } catch (error) {
      if (error instanceof Hcs25CollectorHttpError && error.status === 404) {
        return statusResult('missing', now, url, agentId);
      }
      return statusResult(
        isTimeoutError(error) ? 'timeout' : 'error',
        now,
        url,
        agentId,
      );
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
          source: 'ans-trust-discovery',
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
    id: 'ans-trust-discovery',
    produces: SIGNAL_IDS,
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
